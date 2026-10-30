import { describe, expect, it } from "bun:test";

import { fakeClock } from "./fake-clock";
import { createThrottleLatest } from "./throttle-latest";

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

  it("flush emits the pending value now and the next push waits a full interval", () => {
    const clock = fakeClock();
    const sent: number[] = [];
    const t = createThrottleLatest((v: number) => sent.push(v), 33, clock);
    for (const v of [1, 2]) {
      t.push(v);
    }
    t.flush();
    expect(sent).toEqual([1, 2]);
    clock.advance(10);
    t.push(3);
    expect(sent).toEqual([1, 2]);
    clock.advance(23);
    expect(sent).toEqual([1, 2, 3]);
  });

  it("flush with nothing pending emits nothing", () => {
    const clock = fakeClock();
    const sent: number[] = [];
    const t = createThrottleLatest((v: number) => sent.push(v), 33, clock);
    t.flush();
    t.push(1);
    t.flush();
    clock.advance(100);
    expect(sent).toEqual([1]);
  });
});
