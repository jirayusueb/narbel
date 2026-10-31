import { describe, expect, it } from "bun:test";

import { toSceneElementDto } from "./SceneDto";

const dto = (geometry: Record<string, number>) =>
  toSceneElementDto(
    {
      id: "a",
      type: "rectangle",
      version: 1,
      versionNonce: 1,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      rest: {},
      ...geometry,
    },
    () => {}
  );

describe("toSceneElementDto coordinates", () => {
  it("keeps at most two decimals without trailing zeros or -0", () => {
    const out = dto({
      x: 582.7310838242827,
      y: 509.99999999999994,
      width: -0.004,
      height: 42,
    });
    expect(JSON.stringify(out)).toBe(
      '{"id":"a","type":"rectangle","x":582.73,"y":510,"width":0,"height":42}'
    );
    expect(Object.is(out.width, 0)).toBe(true);
  });
});

describe("toSceneElementDto style", () => {
  const base = {
    id: "a",
    type: "rectangle",
    version: 1,
    versionNonce: 1,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rest: {},
  };

  it("lists non-default style, grouping, frame and lock state", () => {
    const out = toSceneElementDto(
      {
        ...base,
        strokeColor: "#f00",
        strokeWidth: 4,
        roundness: { type: 3 },
        groupIds: ["g"],
        frameId: "f",
        locked: true,
      },
      () => {}
    );
    expect(out).toMatchObject({
      strokeColor: "#f00",
      strokeWidth: 4,
      roundness: true,
      groupIds: ["g"],
      frameId: "f",
      locked: true,
    });
    expect(
      JSON.stringify(
        toSceneElementDto(
          {
            ...base,
            locked: false,
            groupIds: [],
            frameId: null,
            roundness: null,
          },
          () => {}
        )
      )
    ).toBe('{"id":"a","type":"rectangle","x":0,"y":0,"width":10,"height":10}');
  });

  it("reports a label's text style on its container's row and a frame's name", () => {
    const label = {
      ...base,
      id: "l",
      type: "text",
      text: "Hi",
      fontSize: 28,
      textAlign: "center",
    };
    const out = toSceneElementDto(
      { ...base, boundElements: [{ id: "l", type: "text" }] },
      (id) => (id === "l" ? label : undefined)
    );
    expect(out).toMatchObject({ text: "Hi", fontSize: 28 });
    expect(out).not.toHaveProperty("textAlign");
    expect(
      toSceneElementDto({ ...base, type: "frame", name: "Auth" }, () => {})
    ).toMatchObject({ name: "Auth" });
  });

  it("reports an arrow's removed head as null", () => {
    expect(
      toSceneElementDto(
        { ...base, type: "arrow", endArrowhead: null },
        () => {}
      )
    ).toMatchObject({ endArrowhead: null });
  });
});
