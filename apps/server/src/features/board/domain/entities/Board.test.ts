import { describe, expect, it } from "bun:test";

import { BoardTitle } from "../values/BoardTitle";
import { Board } from "./Board";

const board = Board.create(
  "b1",
  "owner",
  BoardTitle.restore("Mine"),
  new Date()
);

describe("Board.protect", () => {
  it("refuses password visibility without a password hash", () => {
    const locked = board.protect("password", null, new Date());
    expect(locked.isErr() && locked.error.code).toBe("ValidationFailed");
    const withHash = board.protect("password", "hash", new Date());
    expect(withHash.isOk() && withHash.value.visibility).toBe("password");
  });
});
