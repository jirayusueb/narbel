import { describe, expect, it } from "bun:test";

import type { SceneElement } from "../entities/SceneElement";
import {
  buildElement,
  buildLabel,
  fitLabel,
  LABEL_FOLLOWS,
  measure,
  SHAPE_TYPES,
} from "./ShapeRegistry";

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

describe("measure", () => {
  it("scales with the font size", () => {
    expect(measure("abcd", 20)).toEqual({ width: 48, height: 25 });
    expect(measure("abcd", 40)).toEqual({ width: 96, height: 50 });
  });
});

describe("fitLabel", () => {
  const arrow = (points: number[][]) =>
    ({
      ...buildElement({ type: "arrow", x: 10, y: 20 }, identity),
      points,
    }) as SceneElement;
  const centerOf = (label: SceneElement) => ({
    x: Number(label.x) + Number(label.width) / 2,
    y: Number(label.y) + Number(label.height) / 2,
  });
  const labelOn = (container: SceneElement) =>
    centerOf(buildLabel(container, "x", {}, { ...identity, id: "t" }));

  it("centers on the midpoint of a 2-point arrow", () => {
    expect(
      labelOn(
        arrow([
          [0, 0],
          [100, 40],
        ])
      )
    ).toEqual({ x: 60, y: 40 });
  });

  it("uses the middle point of an odd count and the middle segment of an even one", () => {
    expect(
      labelOn(
        arrow([
          [0, 0],
          [50, 80],
          [100, 0],
        ])
      )
    ).toEqual({ x: 60, y: 100 });
    expect(
      labelOn(
        arrow([
          [0, 0],
          [40, 0],
          [40, 60],
          [100, 60],
        ])
      )
    ).toEqual({ x: 50, y: 50 });
  });

  it("copies the keys a label follows from its container", () => {
    const container = {
      ...buildElement({ type: "rectangle", x: 0, y: 0 }, identity),
      groupIds: ["g1"],
      frameId: "f1",
      locked: true,
      angle: 1,
      opacity: 40,
    };
    const label = buildLabel(container, "hi", {}, { ...identity, id: "t" });
    for (const key of LABEL_FOLLOWS) {
      expect(label[key]).toEqual(container[key]);
    }
    expect(fitLabel({ ...label, groupIds: [] }, container).groupIds).toEqual([
      "g1",
    ]);
  });

  it("sizes a shape and its label with the given fontSize", () => {
    const small = buildElement({ type: "rectangle", text: "Hello" }, identity);
    const big = buildElement(
      { type: "rectangle", text: "Hello", fontSize: 28 },
      identity
    );
    expect(Number(big.width)).toBeGreaterThan(Number(small.width));
    expect(big).not.toHaveProperty("fontSize");
    expect(buildLabel(big, "Hello", { fontSize: 28 }, identity).fontSize).toBe(
      28
    );
  });
});
