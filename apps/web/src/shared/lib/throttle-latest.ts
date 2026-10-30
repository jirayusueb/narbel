interface Clock {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const realClock: Clock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as number),
};

/** Excalidraw's own collaboration app syncs cursors every 33 ms. */
export const CURSOR_SYNC_MS = 33;

export const ELEMENT_SYNC_MS = CURSOR_SYNC_MS;

export interface ThrottleLatest<T> {
  push: (value: T) => void;
  /** Emits the pending value now, if any; the next push waits a full interval. */
  flush: () => void;
  cancel: () => void;
}

/** At most one `emit` per `intervalMs`; the latest value wins and the last one pushed is always emitted. */
export const createThrottleLatest = <T>(
  emit: (value: T) => void,
  intervalMs: number,
  clock: Clock = realClock
): ThrottleLatest<T> => {
  let pending: { value: T } | null = null;
  let timer: unknown = null;
  let lastEmit = Number.NEGATIVE_INFINITY;

  const emitPending = () => {
    timer = null;
    if (pending) {
      const { value } = pending;
      pending = null;
      lastEmit = clock.now();
      emit(value);
    }
  };

  return {
    push(value: T) {
      pending = { value };
      if (timer !== null) {
        return;
      }
      const wait = lastEmit + intervalMs - clock.now();
      if (wait <= 0) {
        emitPending();
      } else {
        timer = clock.setTimeout(emitPending, wait);
      }
    },
    flush() {
      if (timer !== null) {
        clock.clearTimeout(timer);
      }
      emitPending();
    },
    cancel() {
      pending = null;
      if (timer !== null) {
        clock.clearTimeout(timer);
        timer = null;
      }
    },
  };
};
