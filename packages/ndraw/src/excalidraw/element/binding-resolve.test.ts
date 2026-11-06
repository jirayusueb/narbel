import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import type * as BindingModule from "./binding";
import type * as RestoreModule from "../data/restore";
import type { ExcalidrawElement, ExcalidrawLinearElement, SceneElementsMap } from "./types";

// binding's import graph creates <img> placeholders at module load and reads `window`
const shimmed = ["document", "window", "devicePixelRatio"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();

let resolveArrowBindings: typeof BindingModule.resolveArrowBindings;
let restoreElements: typeof RestoreModule.restoreElements;

beforeAll(async () => {
  for (const key of shimmed) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: (tag: string) => (tag === "img" ? { src: "" } : null) },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: new URL("http://localhost/") },
  });
  Object.defineProperty(globalThis, "devicePixelRatio", { configurable: true, value: 1 });
  [{ resolveArrowBindings }, { restoreElements }] = await Promise.all([
    import("./binding"),
    import("../data/restore"),
  ]);
});

afterAll(() => {
  for (const key of shimmed) {
    const descriptor = saved.get(key);
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, key);
    }
  }
});

const GAP = 8;

/** shape a at x 0..100, shape b at bX..bX+100, an arrow attached to both at y 50 as the server writes it */
const scene = (bX: number, arrowOverrides: Record<string, unknown> = {}) => {
  const elements = restoreElements(
    [
      { type: "rectangle", id: "a", x: 0, y: 0, width: 100, height: 100, boundElements: [{ id: "r", type: "arrow" }] },
      { type: "rectangle", id: "b", x: bX, y: 0, width: 100, height: 100, boundElements: [{ id: "r", type: "arrow" }] },
      {
        type: "arrow",
        id: "r",
        x: 100 + GAP,
        y: 50,
        width: 300 - 100 - 2 * GAP,
        height: 0,
        points: [
          [0, 0],
          [300 - 100 - 2 * GAP, 0],
        ],
        startBinding: { elementId: "a", focus: 0, gap: GAP },
        endBinding: { elementId: "b", focus: 0, gap: GAP },
        ...arrowOverrides,
      },
    ] as unknown as ExcalidrawElement[],
    null,
  );
  const map = new Map(elements.map((el) => [el.id, el])) as unknown as SceneElementsMap;
  return { map, arrow: map.get("r") as ExcalidrawLinearElement };
};

const endX = (geometry: { x: number; points: readonly (readonly [number, number])[] }) =>
  geometry.x + geometry.points[geometry.points.length - 1][0];

describe("resolveArrowBindings", () => {
  it("re-attaches the end to a target that moved after the arrow was written", () => {
    const { map, arrow } = scene(350);
    const resolved = resolveArrowBindings(arrow, map);
    expect(resolved).not.toBeNull();
    expect(resolved!.x).toBeCloseTo(100 + GAP, 6);
    expect(endX(resolved!)).toBeCloseTo(350 - GAP, 6);
  });

  it("returns null for an arrow already sitting on its targets", () => {
    const { map, arrow } = scene(300);
    expect(resolveArrowBindings(arrow, map)).toBeNull();
  });

  it("is idempotent: the resolved geometry resolves to nothing further", () => {
    const { map, arrow } = scene(350);
    const resolved = resolveArrowBindings(arrow, map)!;
    const next = { ...arrow, ...resolved } as ExcalidrawLinearElement;
    map.set("r", next as never);
    expect(resolveArrowBindings(next, map)).toBeNull();
  });

  it("leaves the input arrow and its version untouched", () => {
    const { map, arrow } = scene(350);
    const before = { version: arrow.version, x: arrow.x, points: arrow.points.map((p) => [...p]) };
    resolveArrowBindings(arrow, map);
    expect({ version: arrow.version, x: arrow.x, points: arrow.points.map((p) => [...p]) }).toEqual(before);
  });

  it("ignores a binding whose target is gone", () => {
    const { map, arrow } = scene(350);
    map.delete("b");
    expect(resolveArrowBindings(arrow, map)).toBeNull();
  });

  it("skips elbow arrows, whose router owns the path", () => {
    const { map, arrow } = scene(350, { elbowed: true });
    expect(resolveArrowBindings(arrow, map)).toBeNull();
  });
});
