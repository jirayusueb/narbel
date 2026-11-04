import { describe, expect, it } from "bun:test";

import {
  Atom,
  Computed,
  effect,
  transact,
  unsafeCaptureWithoutSync,
} from "./signals";

describe("Atom", () => {
  it("starts at epoch 0 and a no-op set does not move epochs", () => {
    const a = new Atom(1);
    const other = new Atom(0);
    expect(a.changedEpoch).toBe(0);
    other.set(1);
    const before = other.changedEpoch;
    a.set(1);
    expect(a.changedEpoch).toBe(0);
    other.set(1);
    expect(other.changedEpoch).toBe(before);
    a.set(2);
    expect(a.changedEpoch).toBeGreaterThan(before);
  });

  it("update applies fn to current value", () => {
    const a = new Atom(1);
    a.update((n) => n + 1, "d");
    expect(a.get()).toBe(2);
    expect(a.getDiffSince(0)).toEqual(["d"]);
  });

  it("returns diffs in order and [] when up to date", () => {
    const a = new Atom<number, string>(0);
    a.set(1, "a");
    const e1 = a.changedEpoch;
    a.set(2, "b");
    a.set(3, "c");
    expect(a.getDiffSince(0)).toEqual(["a", "b", "c"]);
    expect(a.getDiffSince(e1)).toEqual(["b", "c"]);
    expect(a.getDiffSince(a.changedEpoch)).toEqual([]);
  });

  it("returns null when a change had no diff", () => {
    const a = new Atom<number, string>(0);
    a.set(1, "a");
    const e1 = a.changedEpoch;
    a.set(2);
    expect(a.getDiffSince(0)).toBeNull();
    expect(a.getDiffSince(e1)).toBeNull();
    expect(a.getDiffSince(a.changedEpoch)).toEqual([]);
  });

  it("keeps exactly the last 32 diffs, even when global epochs skip", () => {
    const a = new Atom<number, number>(0);
    const noise = new Atom(0);
    const epochs: number[] = [];
    for (let i = 1; i <= 40; i++) {
      noise.set(i); // consumes a global epoch between a's changes
      a.set(i, i);
      epochs.push(a.changedEpoch);
    }
    // epochs[7] is the 8th (newest evicted) change
    const all = a.getDiffSince(epochs[7]);
    expect(all).toHaveLength(32);
    expect(all?.[0]).toBe(9);
    expect(all?.[31]).toBe(40);
    expect(a.getDiffSince(epochs[6])).toBeNull();
    // an epoch between the evicted change and the next one is still complete
    expect(a.getDiffSince(epochs[7] + 1)).toHaveLength(32);
    expect(a.getDiffSince(0)).toBeNull();
  });
});

describe("Computed", () => {
  it("is lazy and does not recompute when deps did not change", () => {
    const a = new Atom(1);
    let runs = 0;
    const c = new Computed(() => {
      runs++;
      return a.get() * 2;
    }, [a]);
    expect(runs).toBe(0);
    expect(c.get()).toBe(2);
    expect(c.get()).toBe(2);
    a.set(1);
    expect(c.get()).toBe(2);
    expect(runs).toBe(1);
    a.set(2);
    expect(c.get()).toBe(4);
    expect(runs).toBe(2);
  });

  it("passes the previous value to fn", () => {
    const a = new Atom(1);
    const c = new Computed<number[]>(
      (last) => [...(last ?? []), a.get()],
      [a],
    );
    expect(c.get()).toEqual([1]);
    a.set(2);
    expect(c.get()).toEqual([1, 2]);
  });

  it("does not bump epoch when the recomputed value is Object.is-equal", () => {
    const a = new Atom(1);
    const parity = new Computed(() => a.get() % 2, [a]);
    let downstreamRuns = 0;
    const down = new Computed(() => {
      downstreamRuns++;
      return parity.get();
    }, [parity]);
    expect(down.get()).toBe(1);
    const epoch = parity.changedEpoch;
    a.set(3);
    expect(down.get()).toBe(1);
    expect(parity.changedEpoch).toBe(epoch);
    expect(downstreamRuns).toBe(1);
    a.set(4);
    expect(down.get()).toBe(0);
    expect(downstreamRuns).toBe(2);
  });

  it("syncs nested computeds before comparing epochs", () => {
    const a = new Atom(1);
    const inner = new Computed(() => a.get() + 1, [a]);
    const outer = new Computed(() => inner.get() * 10, [inner]);
    expect(outer.get()).toBe(20);
    a.set(2);
    expect(outer.get()).toBe(30);
  });
});

describe("effect", () => {
  it("runs initially and synchronously after each set", () => {
    const a = new Atom(0);
    const seen: number[] = [];
    effect(() => seen.push(a.get()), [a]);
    a.set(1);
    a.set(2);
    expect(seen).toEqual([0, 1, 2]);
  });

  it("runs once per transaction, nested transactions flush at the outermost", () => {
    const a = new Atom(0);
    const b = new Atom(0);
    const seen: number[] = [];
    effect(() => seen.push(a.get() + b.get()), [a, b]);
    transact(() => {
      a.set(1);
      transact(() => b.set(1));
      expect(seen).toEqual([0]);
    });
    expect(seen).toEqual([0, 2]);
  });

  it("flushes and rethrows when the transaction callback throws", () => {
    const a = new Atom(0);
    const seen: number[] = [];
    effect(() => seen.push(a.get()), [a]);
    expect(() =>
      transact(() => {
        a.set(1);
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(seen).toEqual([0, 1]);
    transact(() => a.set(2)); // depth was restored
    expect(seen).toEqual([0, 1, 2]);
  });

  it("runs once for diamond dependencies", () => {
    const a = new Atom(1);
    const left = new Computed(() => a.get() + 1, [a]);
    const right = new Computed(() => a.get() * 2, [a]);
    let runs = 0;
    effect(() => {
      runs++;
      left.get();
      right.get();
    }, [left, right, a]);
    a.set(2);
    expect(runs).toBe(2);
  });

  it("skips when a computed dependency recomputes to an equal value", () => {
    const a = new Atom(1);
    const parity = new Computed(() => a.get() % 2, [a]);
    let runs = 0;
    effect(() => {
      runs++;
      parity.get();
    }, [parity]);
    a.set(3);
    expect(runs).toBe(1);
    a.set(4);
    expect(runs).toBe(2);
  });

  it("does not miss changes made reentrantly by an effect", () => {
    const a = new Atom(0);
    const b = new Atom(0);
    effect(() => {
      if (a.get() < 3) {
        a.set(a.get() + 1);
      }
    }, [a]);
    const seenB: number[] = [];
    effect(() => seenB.push(b.get()), [b]);
    effect(() => b.set(a.get()), [a]);
    expect(a.get()).toBe(3);
    expect(b.get()).toBe(3);
    expect(seenB.at(-1)).toBe(3);
  });

  it("dispose unlinks the effect, including pending runs", () => {
    const a = new Atom(0);
    let runs = 0;
    const dispose = effect(() => {
      runs++;
      a.get();
    }, [a]);
    transact(() => {
      a.set(1);
      dispose();
    });
    a.set(2);
    expect(runs).toBe(1);
  });

  it("a throwing effect does not stop other effects; error is rethrown", () => {
    const a = new Atom(0);
    const seen: number[] = [];
    effect(() => {
      if (a.get() === 1) {
        throw new Error("bad");
      }
    }, [a]);
    effect(() => seen.push(a.get()), [a]);
    expect(() => a.set(1)).toThrow("bad");
    expect(seen).toEqual([0, 1]);
  });
});

describe("unsafeCaptureWithoutSync", () => {
  it("reads the last cached computed value without syncing; atoms are current", () => {
    const a = new Atom(1);
    const c = new Computed(() => a.get() * 2, [a]);
    expect(c.get()).toBe(2);
    a.set(5);
    const [stale, atom] = unsafeCaptureWithoutSync(() => [c.get(), a.get()]);
    expect(stale).toBe(2);
    expect(atom).toBe(5);
    expect(c.get()).toBe(10);
  });

  it("still initializes a never-computed computed", () => {
    const a = new Atom(3);
    const c = new Computed(() => a.get() + 1, [a]);
    expect(unsafeCaptureWithoutSync(() => c.get())).toBe(4);
  });
});

describe("effect initial run", () => {
  it("refreshes computed deps first so equal derived values do not rerun", () => {
    const a = new Atom(0);
    const parity = new Computed(() => a.get() % 2, [a]);
    let runs = 0;
    effect(() => {
      runs++;
    }, [parity]);
    a.set(2);
    expect(runs).toBe(1);
    a.set(3);
    expect(runs).toBe(2);
  });

  it("initial writes queue and converge without recursion", () => {
    const a = new Atom(0);
    let depth = 0;
    let maxDepth = 0;
    effect(() => {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
      if (a.get() < 5) {
        a.set(a.get() + 1);
      }
      depth--;
    }, [a]);
    expect(a.get()).toBe(5);
    expect(maxDepth).toBe(1);
  });

  it("a throwing initial run unsubscribes and cleans the queue", () => {
    const a = new Atom(0);
    let runs = 0;
    expect(() =>
      effect(() => {
        runs++;
        a.set(1);
        throw new Error("init");
      }, [a]),
    ).toThrow("init");
    a.set(2);
    expect(runs).toBe(1);
  });
});
