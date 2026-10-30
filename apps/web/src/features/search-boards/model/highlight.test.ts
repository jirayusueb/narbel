import { describe, expect, it } from "bun:test";

import { highlight } from "./highlight";

describe("highlight", () => {
  it("marks every case-insensitive occurrence", () => {
    expect(highlight("Plan a plan", "PLAN")).toEqual([
      { text: "Plan", hit: true },
      { text: " a ", hit: false },
      { text: "plan", hit: true },
    ]);
  });

  it("treats regex characters literally and handles Thai", () => {
    expect(highlight("a.c abc", "a.c")).toEqual([
      { text: "a.c", hit: true },
      { text: " abc", hit: false },
    ]);
    expect(highlight("สวัสดีชาวโลก", "ชาว")).toEqual([
      { text: "สวัสดี", hit: false },
      { text: "ชาว", hit: true },
      { text: "โลก", hit: false },
    ]);
  });
});
