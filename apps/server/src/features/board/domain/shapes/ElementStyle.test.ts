import { describe, expect, it } from "bun:test";

import {
  STYLE,
  STYLE_KEYS,
  defaultsFor,
  misplacedStyle,
  routeStyle,
  styleDiff,
  toStored,
} from "./ElementStyle";
import type { StyleKey } from "./ElementStyle";
import { buildElement } from "./ShapeRegistry";

const identity = { id: "e1", seed: 7, versionNonce: 9, updated: 1000 };

describe("routeStyle", () => {
  it("sends text fields to the label of a box or arrow and to a text element itself", () => {
    expect(routeStyle("rectangle", { fontSize: 28, x: 1 })).toEqual({
      own: { x: 1 },
      label: { fontSize: 28 },
    });
    expect(routeStyle("arrow", { fontSize: 28 }).label).toEqual({
      fontSize: 28,
    });
    expect(routeStyle("text", { fontSize: 28 })).toEqual({
      own: { fontSize: 28 },
      label: {},
    });
  });

  it("keeps arrowheads on arrows and drops them elsewhere", () => {
    expect(routeStyle("arrow", { endArrowhead: null }).own).toEqual({
      endArrowhead: null,
    });
    for (const type of ["rectangle", "line", "ellipse", "text", "frame"]) {
      expect(routeStyle(type, { endArrowhead: null })).toEqual({
        own: {},
        label: {},
      });
    }
  });

  it("drops text fields on a line, which has no label slot", () => {
    expect(routeStyle("line", { fontSize: 28, strokeColor: "#f00" })).toEqual({
      own: { strokeColor: "#f00" },
      label: {},
    });
  });
});

describe("misplacedStyle", () => {
  it("names the first field that cannot apply to the type", () => {
    expect(misplacedStyle("rectangle", { endArrowhead: null })).toBe(
      "endArrowhead"
    );
    expect(misplacedStyle("line", { fontSize: 20 })).toBe("fontSize");
    expect(misplacedStyle("arrow", { fontSize: 20, endArrowhead: null })).toBe(
      undefined
    );
  });
});

describe("defaultsFor", () => {
  it("centers labels and left-aligns text", () => {
    expect(defaultsFor("text", "label").textAlign).toBe("center");
    expect(defaultsFor("text").textAlign).toBe("left");
  });

  it("leaves out fields that cannot land on the type", () => {
    expect(defaultsFor("rectangle")).not.toHaveProperty("fontSize");
    expect(defaultsFor("rectangle")).not.toHaveProperty("endArrowhead");
    expect(defaultsFor("arrow").endArrowhead).toBe("arrow");
  });
});

describe("toStored", () => {
  it("stores roundness the way Excalidraw does per type", () => {
    expect(toStored("rectangle", { roundness: true })).toEqual({
      roundness: { type: 3 },
    });
    expect(toStored("ellipse", { roundness: true })).toEqual({
      roundness: { type: 2 },
    });
    expect(toStored("rectangle", { roundness: false, x: 1 })).toEqual({
      roundness: null,
      x: 1,
    });
  });
});

describe("styleDiff", () => {
  const typeFor = (key: StyleKey) => {
    const { on } = STYLE[key];
    if (on === "arrow") {
      return "arrow";
    }
    return on === "text" ? "text" : "rectangle";
  };
  const nonDefault = (key: StyleKey) => {
    const field: (typeof STYLE)[StyleKey] = STYLE[key];
    switch (field.kind) {
      case "color": {
        return "#ff0000";
      }
      case "number": {
        return field.default === field.max ? field.min : field.max;
      }
      case "flag": {
        return !field.default;
      }
      default: {
        return field.values.find((value) => value !== field.default);
      }
    }
  };

  it("reports every style field that differs from its default (derivation guard)", () => {
    for (const key of STYLE_KEYS) {
      const element = buildElement(
        { type: typeFor(key), [key]: nonDefault(key) },
        identity
      );
      expect(styleDiff(element)).toEqual({ [key]: nonDefault(key) });
    }
  });

  it("reports nothing for a default element and an explicit null arrowhead as null", () => {
    expect(styleDiff(buildElement({ type: "arrow" }, identity))).toEqual({});
    expect(
      styleDiff(buildElement({ type: "arrow", endArrowhead: null }, identity))
    ).toEqual({ endArrowhead: null });
  });

  it("reads a container's text style from its label", () => {
    const box = buildElement({ type: "rectangle" }, identity);
    const label = buildElement(
      { type: "text", fontSize: 28, textAlign: "center" },
      identity
    );
    expect(styleDiff(box, label)).toEqual({ fontSize: 28 });
  });
});

describe("toStored roundness per Excalidraw 0.18.1", () => {
  it("uses the adaptive radius for image, iframe and embeddable too", () => {
    for (const type of ["rectangle", "image", "iframe", "embeddable"]) {
      expect(toStored(type, { roundness: true })).toEqual({
        roundness: { type: 3 },
      });
    }
    for (const type of ["diamond", "arrow", "line", "ellipse"]) {
      expect(toStored(type, { roundness: true })).toEqual({
        roundness: { type: 2 },
      });
    }
  });
});
