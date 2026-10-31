import { describe, expect, it } from "bun:test";

import { previewResponse } from "./previewResponse";

describe("previewResponse", () => {
  it("serves a private immutable PNG", async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const res = previewResponse({
      image: { png, width: 1, height: 1, bounds: { x: 0, y: 0, w: 1, h: 1 } },
    } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("private");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(png);
  });

  it("answers 204 for an empty page", async () => {
    const res = previewResponse({ image: null });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });
});
