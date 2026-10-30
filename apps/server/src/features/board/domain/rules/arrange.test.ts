import { describe, expect, it } from "bun:test";

import { arrangeMoves } from "./arrange";
import type { ArrangeItem, Edge } from "./arrange";

const items: ArrangeItem[] = [
  { id: "a", bounds: { x: 0, y: 0, width: 100, height: 40 } },
  { id: "b", bounds: { x: 150, y: 30, width: 50, height: 100 } },
  { id: "c", bounds: { x: 400, y: 10, width: 100, height: 60 } },
];

const apply = (
  list: ArrangeItem[],
  moves: { id: string; dx: number; dy: number }[]
) =>
  list.map((i) => {
    const m = moves.find((mv) => mv.id === i.id);
    return {
      ...i,
      bounds: {
        ...i.bounds,
        x: i.bounds.x + (m?.dx ?? 0),
        y: i.bounds.y + (m?.dy ?? 0),
      },
    };
  });

describe("align", () => {
  const cases: [Edge, (b: ArrangeItem["bounds"]) => number, number][] = [
    ["left", (b) => b.x, 0],
    ["center", (b) => b.x + b.width / 2, 250],
    ["right", (b) => b.x + b.width, 500],
    ["top", (b) => b.y, 0],
    ["middle", (b) => b.y + b.height / 2, 65],
    ["bottom", (b) => b.y + b.height, 130],
  ];
  for (const [edge, measure, target] of cases) {
    it(`${edge} puts every element on ${target}, and a rerun moves nothing`, () => {
      const moves = arrangeMoves(items, { kind: "align", edge });
      const after = apply(items, moves);
      expect(after.map((i) => measure(i.bounds))).toEqual([
        target,
        target,
        target,
      ]);
      expect(arrangeMoves(after, { kind: "align", edge })).toEqual([]);
    });
  }
});

describe("distribute", () => {
  it("keeps the outer elements and equalises the gaps", () => {
    const moves = arrangeMoves(items, {
      kind: "distribute",
      axis: "horizontal",
    });
    expect(moves.map((m) => m.id)).toEqual(["b"]);
    const [a, b, c] = apply(items, moves).map((i) => i.bounds);
    expect(a?.x).toBe(0);
    expect(c?.x).toBe(400);
    expect((b?.x ?? 0) - 100).toBe(400 - ((b?.x ?? 0) + 50));
    expect(
      arrangeMoves(apply(items, moves), {
        kind: "distribute",
        axis: "horizontal",
      })
    ).toEqual([]);
  });

  it("works vertically, spacing the centres of items that overlap", () => {
    const moves = arrangeMoves(items, { kind: "distribute", axis: "vertical" });
    const centres = apply(items, moves)
      .map((i) => i.bounds.y + i.bounds.height / 2)
      .toSorted((p, q) => p - q);
    expect(centres[1]).toBeCloseTo(((centres[0] ?? 0) + (centres[2] ?? 0)) / 2);
  });
});

describe("distribute with overlapping elements", () => {
  const overlapping: ArrangeItem[] = [
    { id: "a", bounds: { x: 0, y: 0, width: 100, height: 10 } },
    { id: "b", bounds: { x: 10, y: 0, width: 10, height: 10 } },
    { id: "c", bounds: { x: 20, y: 0, width: 100, height: 10 } },
  ];
  const how = { kind: "distribute", axis: "horizontal" } as const;

  it("spaces the centres evenly and keeps the outer elements", () => {
    const moves = arrangeMoves(overlapping, how);
    expect(moves).toEqual([{ id: "b", dx: 45, dy: 0 }]);
    expect(arrangeMoves(apply(overlapping, moves), how)).toEqual([]);
  });
});
