import { describe, expect, it } from "bun:test";

import { buildElement, SHAPE_TYPES } from "./ShapeRegistry";

const identity = { id: "e1", seed: 7, versionNonce: 9, updated: 1000 };

describe("buildElement", () => {
  it("builds the minimal base element with defaults", () => {
    expect(buildElement({ type: "rectangle", x: 10, y: 20 }, identity)).toEqual(
      {
        id: "e1",
        type: "rectangle",
        x: 10,
        y: 20,
        width: 100,
        height: 100,
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
        seed: 7,
        version: 1,
        versionNonce: 9,
        isDeleted: false,
        boundElements: null,
        updated: 1000,
        link: null,
        locked: false,
      }
    );
  });

  it("honours explicit size and colors", () => {
    const el = buildElement(
      {
        type: "ellipse",
        x: 0,
        y: 0,
        width: 30,
        height: 40,
        strokeColor: "#f00",
        backgroundColor: "#0f0",
      },
      identity
    );
    expect(el).toMatchObject({
      width: 30,
      height: 40,
      strokeColor: "#f00",
      backgroundColor: "#0f0",
    });
  });

  it("adds text fields and sizes text from its content", () => {
    const el = buildElement(
      { type: "text", x: 0, y: 0, text: "hello\nworld!" },
      identity
    );
    expect(el).toMatchObject({
      text: "hello\nworld!",
      originalText: "hello\nworld!",
      fontSize: 20,
      fontFamily: 5,
      lineHeight: 1.25,
      containerId: null,
      autoResize: true,
      width: 72,
      height: 50,
    });
  });

  it("gives arrows an arrowhead and lines none, both with two points", () => {
    const arrow = buildElement(
      { type: "arrow", x: 0, y: 0, width: 50, height: 10 },
      identity
    );
    const line = buildElement(
      { type: "line", x: 0, y: 0, width: 50, height: 10 },
      identity
    );
    expect(arrow).toMatchObject({
      points: [
        [0, 0],
        [50, 10],
      ],
      endArrowhead: "arrow",
      startArrowhead: null,
    });
    expect(line).toMatchObject({
      endArrowhead: null,
      startBinding: null,
      endBinding: null,
    });
  });

  it("covers every shape type", () => {
    for (const type of SHAPE_TYPES) {
      expect(buildElement({ type, x: 0, y: 0 }, identity).type).toBe(type);
    }
  });
});
