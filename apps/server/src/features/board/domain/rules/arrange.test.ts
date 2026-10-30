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
  // selection bounds: x 0..500, y 0..130
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

  it("works vertically", () => {
    const moves = arrangeMoves(items, { kind: "distribute", axis: "vertical" });
    const after = apply(items, moves).toSorted(
      (p, q) => p.bounds.y - q.bounds.y
    );
    const gaps = after
      .slice(1)
      .map(
        (n, i) =>
          n.bounds.y -
          ((after[i]?.bounds.y ?? 0) + (after[i]?.bounds.height ?? 0))
      );
    expect(gaps[0]).toBeCloseTo(gaps[1] ?? Number.NaN);
  });
});
