import { expect, test } from "bun:test";

import { safeRedirect } from "./safe-redirect";

test("keeps same-origin paths with query and hash", () => {
  expect(safeRedirect("/boards/abc?share=t#x")).toBe("/boards/abc?share=t#x");
  expect(safeRedirect("/")).toBe("/");
});

test("rejects anything that can leave the origin", () => {
  for (const bad of [
    "//evil.com",
    "/\\evil.com",
    "https://evil.com",
    ["javascript", "alert(1)"].join(":"),
    "boards/abc",
    "/\t/evil.com",
    "",
    undefined,
    42,
  ]) {
    expect(safeRedirect(bad)).toBeUndefined();
  }
});
