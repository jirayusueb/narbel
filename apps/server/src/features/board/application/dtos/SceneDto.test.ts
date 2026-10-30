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
