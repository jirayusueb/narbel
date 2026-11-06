import { describe, expect, it } from "bun:test";

import { interpolateCamera } from "./zoom";

describe("interpolateCamera", () => {
  it("t=0 returns the from camera", () => {
    const from = { scrollX: 10, scrollY: -5, zoom: 0.8 };
    const to = { scrollX: 100, scrollY: 50, zoom: 2.4 };
    const result = interpolateCamera(from, to, 0);
    expect(result.scrollX).toBe(10);
    expect(result.scrollY).toBe(-5);
    expect(result.zoom).toBeCloseTo(0.8, 15);
  });

  it("t=1 returns the to camera", () => {
    const from = { scrollX: 10, scrollY: -5, zoom: 0.8 };
    const to = { scrollX: 100, scrollY: 50, zoom: 2.4 };
    const result = interpolateCamera(from, to, 1);
    expect(result.scrollX).toBe(100);
    expect(result.scrollY).toBe(50);
    expect(result.zoom).toBeCloseTo(2.4, 15);
  });

  it("interpolates zoom in log space (geometric mean at midpoint)", () => {
    const result = interpolateCamera(
      { scrollX: 0, scrollY: 0, zoom: 0.5 },
      { scrollX: 0, scrollY: 0, zoom: 2 },
      0.5,
    );
    expect(result.zoom).toBeCloseTo(1, 12);
  });

  it("scroll interpolates linearly", () => {
    const result = interpolateCamera(
      { scrollX: 0, scrollY: 20, zoom: 1 },
      { scrollX: 100, scrollY: 0, zoom: 1 },
      0.25,
    );
    expect(result.scrollX).toBe(25);
    expect(result.scrollY).toBe(15);
    expect(result.zoom).toBeCloseTo(1, 15);
  });
});
