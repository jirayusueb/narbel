import { expect, test } from "bun:test";

import { stashImport, takeImport } from "./pending-import";

test("a stashed scene is handed over once, to its own board only", () => {
  stashImport("b1", { elements: [], files: [], stored: [] });
  expect(takeImport("b2")).toBeUndefined();
  expect(takeImport("b1")).toEqual({ elements: [], files: [], stored: [] });
  expect(takeImport("b1")).toBeUndefined();
});
