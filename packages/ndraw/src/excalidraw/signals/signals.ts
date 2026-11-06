// Minimal pull-based signals: explicit dependencies, no auto-tracking.

let globalEpoch = 0;
let txDepth = 0;
let noSyncDepth = 0;
let flushing = false;
const pendingEffects = new Set<EffectNode>();

const HISTORY = 32;

/** What Computed and effect need from a dependency (Atom or Computed of any T). */
export interface Dependency {
  /** Global epoch of the last real change; 0 for a never-changed Atom. */
  readonly changedEpoch: number;
  /** Bring this node up to date (no-op for Atom). */
  refresh(): void;
  /** Called when anything upstream may have changed. Returns unsubscribe. */
  subscribe(listener: () => void): () => void;
}

interface EffectNode {
  run(): void;
}

const flush = () => {
  if (flushing || txDepth > 0) {
    return;
  }
  flushing = true;
  let error: unknown;
  let failed = false;
  try {
    while (pendingEffects.size > 0) {
      const next = pendingEffects.values().next().value as EffectNode;
      pendingEffects.delete(next);
      try {
        next.run();
      } catch (e) {
        if (!failed) {
          failed = true;
          error = e;
        }
      }
    }
  } finally {
    flushing = false;
  }
  if (failed) {
    throw error;
  }
};

export class Atom<T, D = unknown> implements Dependency {
  changedEpoch = 0;
  private value: T;
  private readonly listeners = new Set<() => void>();
  // circular buffer of the last HISTORY changes; `count` = total ever written
  private readonly ring: ({ epoch: number; diff: D; hasDiff: boolean } | undefined)[] =
    new Array(HISTORY);
  private count = 0;
  // epoch of the newest record dropped from `history`; diffs after it are complete
  private evictedEpoch = 0;

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  set(next: T, diff?: D): void {
    if (Object.is(next, this.value)) {
      return;
    }
    this.value = next;
    this.changedEpoch = ++globalEpoch;
    const slot = this.count % HISTORY;
    const dropped = this.ring[slot];
    if (dropped) {
      this.evictedEpoch = dropped.epoch;
    }
    this.ring[slot] = {
      epoch: this.changedEpoch,
      diff: diff as D,
      hasDiff: diff !== undefined,
    };
    this.count++;
    for (const l of [...this.listeners]) {
      l();
    }
    flush();
  }

  update(fn: (t: T) => T, diff?: D): void {
    this.set(fn(this.value), diff);
  }

  /**
   * Diffs of every change after `epoch`, oldest first. null when any of them
   * was set without a diff or has fallen out of the last-32 history.
   */
  getDiffSince(epoch: number): D[] | null {
    if (epoch >= this.changedEpoch) {
      return [];
    }
    if (this.evictedEpoch > epoch) {
      return null;
    }
    const out: D[] = [];
    const start = this.count - Math.min(this.count, HISTORY);
    for (let i = start; i < this.count; i++) {
      const r = this.ring[i % HISTORY];
      if (r && r.epoch > epoch) {
        if (!r.hasDiff) {
          return null;
        }
        out.push(r.diff);
      }
    }
    return out;
  }

  refresh(): void {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export class Computed<T> implements Dependency {
  changedEpoch = 0;
  private value!: T;
  private initialized = false;
  private seenEpoch = -1;
  private readonly listeners = new Set<() => void>();
  private unsubDeps: (() => void)[] | null = null;

  constructor(
    private readonly fn: (last: T | undefined) => T,
    private readonly deps: readonly Dependency[],
  ) {}

  get(): T {
    if (!(this.initialized && noSyncDepth > 0)) {
      this.refresh();
    }
    return this.value;
  }

  refresh(): void {
    if (this.initialized && noSyncDepth > 0) {
      return;
    }
    if (this.initialized && this.seenEpoch === globalEpoch) {
      return;
    }
    let dirty = !this.initialized;
    for (const d of this.deps) {
      d.refresh();
      if (d.changedEpoch > this.seenEpoch) {
        dirty = true;
      }
    }
    if (dirty) {
      const next = this.fn(this.initialized ? this.value : undefined);
      if (!(this.initialized && Object.is(next, this.value))) {
        this.value = next;
        this.changedEpoch = ++globalEpoch;
      }
      this.initialized = true;
    }
    this.seenEpoch = globalEpoch;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (!this.unsubDeps) {
      const forward = () => {
        for (const l of [...this.listeners]) {
          l();
        }
      };
      this.unsubDeps = this.deps.map((d) => d.subscribe(forward));
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.unsubDeps) {
        for (const u of this.unsubDeps) {
          u();
        }
        this.unsubDeps = null;
      }
    };
  }
}

/** Batch changes; effects run once, synchronously, when the outermost call ends (also on throw). */
export const transact = (fn: () => void): void => {
  txDepth++;
  try {
    fn();
  } finally {
    txDepth--;
    flush();
  }
};

/**
 * Run `fn` and any Computed read inside it returns its last cached value
 * without syncing dependencies (possibly stale). A never-computed Computed
 * still initializes; Atoms read current values.
 */
export const unsafeCaptureWithoutSync = <R>(fn: () => R): R => {
  noSyncDepth++;
  try {
    return fn();
  } finally {
    noSyncDepth--;
  }
};

/**
 * Run `fn` now and again after each transaction/set in which a dependency's
 * value really changed (once per flush even with diamond deps).
 */
export const effect = (
  fn: () => void,
  deps: readonly Dependency[],
): (() => void) => {
  let lastSeen = -1;
  let disposed = false;

  const node: EffectNode = {
    run() {
      if (disposed) {
        return;
      }
      let changed = false;
      for (const d of deps) {
        d.refresh();
        if (d.changedEpoch > lastSeen) {
          changed = true;
        }
      }
      if (!changed) {
        return;
      }
      // marked before fn so changes made by fn itself re-trigger it
      lastSeen = globalEpoch;
      fn();
    },
  };
  const unsubs = deps.map((d) =>
    d.subscribe(() => {
      if (!disposed) {
        pendingEffects.add(node);
      }
    }),
  );

  for (const d of deps) {
    d.refresh();
  }
  lastSeen = globalEpoch;
  // transaction guard: writes made by the first run queue and flush after it returns
  txDepth++;
  try {
    fn();
  } catch (e) {
    disposed = true;
    pendingEffects.delete(node);
    for (const u of unsubs) {
      u();
    }
    throw e;
  } finally {
    txDepth--;
    flush();
  }

  return () => {
    disposed = true;
    pendingEffects.delete(node);
    for (const u of unsubs) {
      u();
    }
  };
};
