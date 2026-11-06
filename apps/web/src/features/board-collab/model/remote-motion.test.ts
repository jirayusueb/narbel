import { expect, test } from "bun:test";

import type { ExcalidrawElement } from "@narbel/ndraw/element/types";

import {
  PARK_TTL_MS,
  RemoteMotion,
  easeElement,
  easeToward,
  interactedIds,
  isMotionOnly,
} from "./remote-motion";

const rect = (over: Record<string, unknown> = {}) =>
  ({
    id: "a",
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    angle: 0,
    version: 1,
    versionNonce: 1,
    updated: 1,
    strokeColor: "#000",
    boundElements: [{ id: "t", type: "text" }],
    ...over,
  }) as unknown as ExcalidrawElement;

test("only the next version that moved the element counts as motion", () => {
  const shown = rect();
  expect(isMotionOnly(shown, rect({ version: 2, x: 5, angle: 1 }))).toBe(true);
  expect(isMotionOnly(shown, rect({ version: 3, x: 5 }))).toBe(false);
  expect(isMotionOnly(shown, rect({ version: 2, strokeColor: "#f00" }))).toBe(
    false
  );
  expect(isMotionOnly(shown, rect({ version: 2, isDeleted: true }))).toBe(
    false
  );
  expect(isMotionOnly(shown, rect({ version: 2, boundElements: [] }))).toBe(
    false
  );
});

test("a changed point count is not motion", () => {
  const line = rect({
    points: [
      [0, 0],
      [1, 1],
    ],
  });
  expect(
    isMotionOnly(
      line,
      rect({
        version: 2,
        points: [
          [0, 0],
          [2, 2],
        ],
      })
    )
  ).toBe(true);
  expect(
    isMotionOnly(
      line,
      rect({
        version: 2,
        points: [
          [0, 0],
          [1, 1],
          [2, 2],
        ],
      })
    )
  ).toBe(false);
});

test("easing converges monotonically and snaps inside half a pixel", () => {
  let x = 0;
  let prev = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 200 && x !== 100; i += 1) {
    x = easeToward(x, 100, 16);
    expect(100 - x).toBeLessThan(prev);
    prev = 100 - x;
  }
  expect(x).toBe(100);
  expect(easeToward(99.6, 100, 16)).toBe(100);
  // one time constant covers ~63% of the gap
  expect(easeToward(0, 100, 80)).toBeCloseTo(63.2, 0);
});

test("an eased element keeps its version until it lands, then becomes the target", () => {
  const shown = rect({
    points: [
      [0, 0],
      [10, 0],
    ],
  });
  const target = rect({
    version: 2,
    x: 100,
    points: [
      [0, 0],
      [20, 0],
    ],
  });
  const step = easeElement(shown, target, 80);
  expect(step.done).toBe(false);
  expect(step.element.version).toBe(1);
  expect(step.element.x).toBeGreaterThan(0);
  expect(step.element.x).toBeLessThan(100);
  const landed = easeElement(
    rect({
      x: 99.9,
      points: [
        [0, 0],
        [19.9, 0],
      ],
    }),
    target,
    16
  );
  expect(landed.done).toBe(true);
  expect(landed.element).toBe(target);
});

const state = (over: Record<string, unknown> = {}) =>
  ({
    selectedElementIds: { box: true },
    selectedElementsAreBeingDragged: false,
    isResizing: false,
    isRotating: false,
    editingTextElement: null,
    newElement: null,
    selectedLinearElement: null,
    ...over,
  }) as unknown as Parameters<typeof interactedIds>[0];

const scene = [
  { id: "box" },
  { id: "label", containerId: "box" },
  { id: "other" },
];

test("a plain selection is not an interaction", () => {
  expect([...interactedIds(state(), scene)]).toEqual([]);
});

test("dragging, resizing or rotating the selection claims it and its bound text", () => {
  for (const flag of [
    "selectedElementsAreBeingDragged",
    "isResizing",
    "isRotating",
  ]) {
    expect(
      [...interactedIds(state({ [flag]: true }), scene)].toSorted()
    ).toEqual(["box", "label"]);
  }
});

test("text editing, a new element and a dragged line point are claimed", () => {
  expect([
    ...interactedIds(state({ editingTextElement: { id: "label" } }), scene),
  ]).toEqual(["label"]);
  expect([...interactedIds(state({ newElement: { id: "n" } }), scene)]).toEqual(
    ["n"]
  );
  const idle = { elementId: "line", isDragging: false };
  expect(
    interactedIds(state({ selectedLinearElement: idle }), scene).size
  ).toBe(0);
  const live = { elementId: "line", isDragging: true };
  expect([
    ...interactedIds(state({ selectedLinearElement: live }), scene),
  ]).toEqual(["line"]);
});

const harness = () => {
  let at = 0;
  const released: string[][] = [];
  const motion = new RemoteMotion(
    {} as never,
    (ids) => released.push(ids),
    "NEVER" as never,
    () => at
  );
  // route() starts a rAF loop; stub it so no frame is requested
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame =
    () => 1;
  return {
    motion,
    released,
    advance: (ms: number) => {
      at += ms;
    },
  };
};

test("remote updates split into immediate, eased and parked", () => {
  const { motion } = harness();
  const shown = new Map([
    ["moved", rect({ id: "moved" })],
    ["styled", rect({ id: "styled" })],
    ["held", rect({ id: "held" })],
  ]);
  const { apply, moving } = motion.route(
    [
      rect({ id: "moved", version: 2, x: 50 }),
      rect({ id: "styled", version: 2, strokeColor: "#f00" }),
      rect({ id: "held", version: 2, x: 50 }),
      rect({ id: "fresh", version: 1 }),
    ],
    shown,
    new Set(["held"])
  );
  expect(moving.map((e) => e.id)).toEqual(["moved"]);
  expect(apply.map((e) => e.id).toSorted()).toEqual(["fresh", "styled"]);
  expect(motion.parked.has("held")).toBe(true);
  // the next motion update is judged against the pending target, not the stale shown element
  const next = motion.route(
    [rect({ id: "moved", version: 3, x: 80 })],
    shown,
    new Set()
  );
  expect(next.moving).toHaveLength(1);
  expect(motion.targets.get("moved")?.x).toBe(80);
  // a non-motion update supersedes the pending target
  motion.route(
    [rect({ id: "moved", version: 4, strokeColor: "#0f0" })],
    shown,
    new Set()
  );
  expect(motion.targets.has("moved")).toBe(false);
});

test("parked ids are released once the gesture ends, and expire after 30s", () => {
  const { motion, released } = harness();
  motion.route(
    [rect({ id: "box", version: 2, x: 5 })],
    new Map(),
    new Set(["box"])
  );
  motion.settle(state({ selectedElementsAreBeingDragged: true }), scene);
  expect(released).toEqual([]);
  motion.settle(state(), scene);
  expect(released.flat().toSorted()).toEqual(["box"]);
  expect(motion.parked.size).toBe(0);

  const second = harness();
  second.motion.route(
    [rect({ id: "box", version: 2, x: 5 })],
    new Map(),
    new Set(["box"])
  );
  second.advance(PARK_TTL_MS + 1);
  second.motion.settle(state(), scene);
  expect(second.released).toEqual([]);
  expect(second.motion.parked.size).toBe(0);
});
