import { describe, expect, it } from "bun:test";

import { BoardTitle } from "../values/BoardTitle";
import { createBoard, protectBoard } from "./Board";

const board = createBoard(
  "b1",
  "owner",
  BoardTitle.restore("Mine"),
  new Date()
);

describe("Board.protect", () => {
  it("refuses password visibility without a password hash", () => {
    const locked = protectBoard(board, "password", null, new Date());
    expect(locked.isErr() && locked.error.code).toBe("ValidationFailed");
    const withHash = protectBoard(board, "password", "hash", new Date());
    expect(withHash.isOk() && withHash.value.visibility).toBe("password");
  });
});
