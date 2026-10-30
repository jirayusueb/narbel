import { describe, expect, test } from "bun:test";

import { placePopover } from "./place-popover";

const bounds = { width: 390, height: 700 };
const size = { width: 320, height: 200 };

describe("placePopover", () => {
  test("sits beside the anchor when it fits", () => {
    expect(
      placePopover({ anchor: { left: 20, top: 100 }, bounds, size })
    ).toEqual({ left: 34, top: 100 });
  });

  test("pulls left so the right edge keeps its margin", () => {
    expect(
      placePopover({ anchor: { left: 300, top: 100 }, bounds, size }).left
    ).toBe(58);
  });

  test("never passes the left margin on narrow layers", () => {
    expect(
      placePopover({
        anchor: { left: 100, top: 100 },
        bounds: { width: 300, height: 700 },
        size,
      }).left
    ).toBe(12);
  });

  test("flips above the anchor near the bottom", () => {
    expect(
      placePopover({
        anchor: { left: 20, top: 600 },
        bounds,
        size,
        anchorHeight: 12,
      }).top
    ).toBe(374);
  });

  test("stays inside the top margin when neither side fits", () => {
    expect(
      placePopover({
        anchor: { left: 20, top: 100 },
        bounds: { width: 390, height: 150 },
        size,
      }).top
    ).toBe(12);
  });
});
