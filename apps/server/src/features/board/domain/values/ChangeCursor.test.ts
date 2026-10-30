import { describe, expect, it } from "bun:test";

import { ChangeCursor } from "./ChangeCursor";
import type { SceneVersion } from "./ChangeCursor";

const scene = new Uint8Array([1, 2, 3]) as SceneVersion;
const now = new Date("2026-10-30T09:00:00.000Z");

describe("ChangeCursor", () => {
  it("round-trips for its own board", () => {
    const cursor = ChangeCursor.start("b1", scene, now).advance(scene, {
      at: new Date("2026-10-30T09:05:00.000Z"),
      id: "c9",
    });
    const back = ChangeCursor.parse(cursor.encode(), "b1");
    expect([...(back?.scene ?? [])]).toEqual([1, 2, 3]);
    expect(back?.comments).toEqual({
      at: new Date("2026-10-30T09:05:00.000Z"),
      id: "c9",
    });
  });

  it("keeps the comment position when no comment was shown", () => {
    const next = ChangeCursor.start("b1", scene, now).advance(scene);
    expect(ChangeCursor.parse(next.encode(), "b1")?.comments.at).toEqual(now);
  });

  it("rejects another board, another format and garbage", () => {
    const raw = ChangeCursor.start("b1", scene, now).encode();
    const older = Buffer.from(
      JSON.stringify({ v: 0, b: "b1", s: "", a: 0, i: "" })
    ).toString("base64url");
    expect(ChangeCursor.parse(raw, "b2")).toBeNull();
    expect(ChangeCursor.parse(older, "b1")).toBeNull();
    expect(ChangeCursor.parse("not a cursor", "b1")).toBeNull();
    expect(ChangeCursor.parse("", "b1")).toBeNull();
  });
});
