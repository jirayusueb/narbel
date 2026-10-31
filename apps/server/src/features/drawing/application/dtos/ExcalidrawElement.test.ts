import { describe, expect, it } from "bun:test";

import { toElement, toExcalidraw } from "./ExcalidrawElement";
import type { ExcalidrawElement } from "./ExcalidrawElement";

const base = {
  version: 3,
  versionNonce: 41,
  isDeleted: false,
  x: 10,
  y: 20,
  width: 100,
  height: 60,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: null,
  seed: 1234,
  updated: 1_700_000_000_000,
  link: null,
  locked: false,
  index: "a1",
};

const shapes: Record<string, ExcalidrawElement> = {
  "rectangle with label": {
    ...base,
    id: "box",
    type: "rectangle",
    roundness: { type: 3 },
    boundElements: [
      { id: "label", type: "text" },
      { id: "arrow", type: "arrow" },
    ],
  },
  "text bound to its container": {
    ...base,
    id: "label",
    type: "text",
    text: "Hello\nworld",
    originalText: "Hello world",
    fontSize: 20,
    fontFamily: 5,
    textAlign: "center",
    verticalAlign: "middle",
    containerId: "box",
    lineHeight: 1.25,
    autoResize: true,
    boundElements: null,
  },
  "arrow with bindings and points": {
    ...base,
    id: "arrow",
    type: "arrow",
    points: [
      [0, 0],
      [40, 10],
      [80, 0],
    ],
    lastCommittedPoint: null,
    startBinding: { elementId: "box", focus: 0.2, gap: 1, fixedPoint: null },
    endBinding: { elementId: "frame", focus: 0, gap: 1 },
    startArrowhead: null,
    endArrowhead: "triangle",
    elbowed: false,
  },
  "image with a file": {
    ...base,
    id: "img",
    type: "image",
    fileId: "sha1",
    status: "saved",
    scale: [-1, 1],
    crop: { x: 0, y: 0, width: 5, height: 5, naturalWidth: 10 },
  },
  "frame with children": {
    ...base,
    id: "frame",
    type: "frame",
    name: "Auth",
  },
  "grouped, locked child of a frame": {
    ...base,
    id: "child",
    type: "ellipse",
    groupIds: ["inner", "outer"],
    frameId: "frame",
    locked: true,
  },
  "deleted tombstone": {
    id: "gone",
    type: "rectangle",
    version: 9,
    versionNonce: 2,
    isDeleted: true,
    updated: 5,
  },
  "unknown future fields and odd values": {
    ...base,
    id: "future",
    type: "magicframe",
    customData: { owner: "agent", nested: [1, { deep: true }] },
    hypothetical: 42,
    // a malformed value of a typed field is kept as stored
    x: "12",
    groupIds: ["g", 7],
    boundElements: [{ id: "x" }],
    startBinding: { focus: 0 },
    points: [[0, "a"]],
    index: null,
    polygon: true,
    undefinedField: undefined,
  },
};

describe("Excalidraw element adapter", () => {
  for (const [name, stored] of Object.entries(shapes)) {
    it(`round-trips losslessly: ${name}`, () => {
      expect(toExcalidraw(toElement(stored))).toStrictEqual(stored);
    });
  }

  it("types the fields the rules read and keeps the rest opaque", () => {
    const arrow = toElement(
      shapes["arrow with bindings and points"] as ExcalidrawElement
    );
    expect(arrow.startBinding?.elementId).toBe("box");
    expect(arrow.points).toEqual([
      [0, 0],
      [40, 10],
      [80, 0],
    ]);
    expect(arrow.rest).toEqual({
      seed: 1234,
      link: null,
      lastCommittedPoint: null,
      elbowed: false,
    });
    const odd = toElement(
      shapes["unknown future fields and odd values"] as ExcalidrawElement
    );
    expect(odd.x).toBeUndefined();
    expect(odd.index).toBeUndefined();
    expect(odd.rest).toMatchObject({ x: "12", index: null, hypothetical: 42 });
  });

  it("lets a typed field written by a rule win over a malformed stored value", () => {
    const odd = toElement(
      shapes["unknown future fields and odd values"] as ExcalidrawElement
    );
    expect(toExcalidraw({ ...odd, x: 30, index: "a2" })).toMatchObject({
      x: 30,
      index: "a2",
    });
  });
});
