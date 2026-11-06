import { describe, expect, test } from "bun:test";
import { RemotePointerSmoother } from "./remote-pointer-smoothing";
import type { SocketId } from "./types";

const PEER = "peer" as SocketId;
const FRAME_MS = 1000 / 60;

const smootherAt = (x: number, now = 1000) => {
  const smoother = new RemotePointerSmoother();
  smoother.setTargets(new Map([[PEER, { x, y: 0 }]]), now);
  smoother.advanceTo(now);
  return smoother;
};

describe("RemotePointerSmoother", () => {
  test("needs no frames before any peer has moved, even right after page start", () => {
    expect(new RemotePointerSmoother().advanceTo(5)).toBe(false);
  });

  test("a teleporting peer glides at most 20 viewport px per 60Hz frame", () => {
    const smoother = smootherAt(0);
    smoother.setTargets(new Map([[PEER, { x: 400, y: 0 }]]), 1000);
    let shown = 0;
    for (let frame = 1; frame <= 5; frame++) {
      smoother.advanceTo(1000 + frame * FRAME_MS);
      const next = smoother.get(PEER)!.x;
      expect(next - shown).toBeLessThanOrEqual(20 + 1e-9);
      shown = next;
    }
    expect(shown).toBeGreaterThan(0);
  });

  test("the cap is in viewport px: at zoom 2 a frame covers half the scene distance", () => {
    const smoother = smootherAt(0);
    smoother.setTargets(new Map([[PEER, { x: 400, y: 0 }]]), 1000);
    smoother.advanceTo(1000 + FRAME_MS, 2);
    expect(smoother.get(PEER)!.x).toBeCloseTo(10, 6);
  });

  test("two advances in one frame travel no further than one", () => {
    const once = smootherAt(0);
    const twice = smootherAt(0);
    for (const s of [once, twice]) {
      s.setTargets(new Map([[PEER, { x: 400, y: 0 }]]), 1000);
    }
    once.advanceTo(1000 + FRAME_MS);
    twice.advanceTo(1000 + FRAME_MS);
    // a rAF frame-start timestamp earlier than the effect's performance.now()
    twice.advanceTo(1000 + FRAME_MS - 3);
    twice.advanceTo(1000 + FRAME_MS);
    expect(twice.get(PEER)!.x).toBe(once.get(PEER)!.x);
  });

  test("settles on the target and stops asking for frames", () => {
    const smoother = smootherAt(0);
    smoother.setTargets(new Map([[PEER, { x: 30, y: 0 }]]), 1000);
    let now = 1000;
    while (smoother.advanceTo((now += FRAME_MS)) && now < 3000) {
      // drain
    }
    expect(smoother.get(PEER)).toEqual({ x: 30, y: 0 });
    expect(now).toBeLessThan(3000);
  });

  test("a peer that leaves is forgotten", () => {
    const smoother = smootherAt(0);
    smoother.setTargets(new Map(), 1000);
    expect(smoother.get(PEER)).toBeUndefined();
  });
});
