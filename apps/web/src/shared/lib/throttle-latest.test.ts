import { describe, expect, it } from "bun:test";

import { createThrottleLatest } from "./throttle-latest";

const fakeClock = () => {
  let time = 1000;
  let task: { at: number; fn: () => void } | null = null;
  return {
    now: () => time,
    setTimeout: (fn: () => void, ms: number) => {
      task = { at: time + ms, fn };
      return task;
    },
    clearTimeout: () => {
      task = null;
    },
    advance(ms: number) {
      time += ms;
      if (task && task.at <= time) {
        const { fn } = task;
        task = null;
        fn();
      }
    },
  };
};

describe("createThrottleLatest", () => {
  it("sends the first value at once and at most one per interval after", () => {
    const clock = fakeClock();
    const sent: number[] = [];
    const t = createThrottleLatest((v: number) => sent.push(v), 33, clock);
    for (const v of [1, 2, 3]) {
      t.push(v);
    }
    expect(sent).toEqual([1]);
    clock.advance(33);
    expect(sent).toEqual([1, 3]);
  });

  it("always delivers the final value after a burst", () => {
    const clock = fakeClock();
    const sent: number[] = [];
    const t = createThrottleLatest((v: number) => sent.push(v), 33, clock);
    for (let i = 0; i < 10; i += 1) {
      t.push(i);
      clock.advance(5);
    }
    clock.advance(100);
    expect(sent.at(-1)).toBe(9);
    expect(sent.length).toBeLessThan(5);
  });

  it("sends immediately again after a quiet period", () => {
    const clock = fakeClock();
    const sent: number[] = [];
    const t = createThrottleLatest((v: number) => sent.push(v), 33, clock);
    t.push(1);
    clock.advance(500);
    t.push(2);
    expect(sent).toEqual([1, 2]);
  });

  it("drops the pending value on cancel", () => {
    const clock = fakeClock();
    const sent: number[] = [];
    const t = createThrottleLatest((v: number) => sent.push(v), 33, clock);
    for (const v of [1, 2]) {
      t.push(v);
    }
    t.cancel();
    clock.advance(100);
    expect(sent).toEqual([1]);
  });
});
