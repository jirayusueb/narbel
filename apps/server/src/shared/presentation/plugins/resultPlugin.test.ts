import { describe, expect, it } from "bun:test";

import { AppError } from "../../kernel/errors/AppError";
import { err } from "../../kernel/types/Result";
import { resultToResponse } from "./resultPlugin";

describe("resultToResponse", () => {
  it("marks error responses uncacheable, so a restored board is not stuck behind a cached 410", () => {
    const res = resultToResponse(err(AppError.gone("Board is in the trash")), {
      headers: {},
    });
    expect(res?.status).toBe(410);
    expect(res?.headers.get("cache-control")).toBe("no-store");
  });
});
