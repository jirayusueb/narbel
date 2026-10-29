import { describe, expect, it } from "bun:test";

import { BoardTitle } from "./BoardTitle";

describe("BoardTitle", () => {
  it("trims surrounding whitespace", () => {
    const title = BoardTitle.create("  Roadmap  ");
    expect(title.isOk() && title.value.value).toBe("Roadmap");
  });

  it("rejects empty and whitespace-only titles", () => {
    expect(BoardTitle.create("").isErr()).toBe(true);
    expect(BoardTitle.create("   ").isErr()).toBe(true);
  });

  it("accepts exactly 120 characters and rejects 121", () => {
    expect(BoardTitle.create("a".repeat(120)).isOk()).toBe(true);
    const tooLong = BoardTitle.create("a".repeat(121));
    expect(tooLong.isErr() && tooLong.error.code).toBe("ValidationFailed");
  });

  it("measures length after trimming", () => {
    expect(BoardTitle.create(` ${"a".repeat(120)} `).isOk()).toBe(true);
  });
});
