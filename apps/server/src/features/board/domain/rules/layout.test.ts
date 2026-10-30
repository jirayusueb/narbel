import { describe, expect, it } from "bun:test";

import { layered } from "./layout";

const nodes = [
  { id: "a", width: 100, height: 60 },
  { id: "b", width: 100, height: 60 },
];

describe("layered rank gap", () => {
  it("keeps 80 without a label and grows for a long label in both directions", () => {
    const label = { width: 300, height: 100 };
    const gap = (direction: "down" | "right", withLabel: boolean) => {
      const at = layered(
        nodes,
        [{ from: "a", to: "b", label: withLabel ? label : undefined }],
        direction
      );
      const [a, b] = [at.get("a"), at.get("b")];
      return direction === "down"
        ? (b?.y ?? 0) - ((a?.y ?? 0) + 60)
        : (b?.x ?? 0) - ((a?.x ?? 0) + 100);
    };
    expect(gap("down", false)).toBe(80);
    expect(gap("down", true)).toBe(164);
    expect(gap("right", false)).toBe(80);
    expect(gap("right", true)).toBe(364);
  });

  it("never shrinks below 80 for a short label", () => {
    const at = layered(
      nodes,
      [{ from: "a", to: "b", label: { width: 10, height: 10 } }],
      "right"
    );
    expect((at.get("b")?.x ?? 0) - 100).toBe(80);
  });
});

describe("layered skipped ranks", () => {
  it("widens every gap a labelled edge crosses", () => {
    const chain = [
      { id: "a", width: 100, height: 60 },
      { id: "b", width: 100, height: 60 },
      { id: "c", width: 100, height: 60 },
    ];
    const at = layered(
      chain,
      [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "a", to: "c", label: { width: 10, height: 100 } },
      ],
      "down"
    );
    const gap = (upper: string, lower: string) =>
      (at.get(lower)?.y ?? 0) - ((at.get(upper)?.y ?? 0) + 60);
    expect(gap("a", "b")).toBe(164);
    expect(gap("b", "c")).toBe(164);
  });
});
