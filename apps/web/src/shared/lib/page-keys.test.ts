import { expect, test } from "bun:test";

import { elementIdOf, elementKey, isOnPage } from "./page-keys";

test("elements belong only to their own page", () => {
  const key = elementKey("page:main", "abc");
  expect(key).toBe("page:main:abc");
  expect(isOnPage("page:main", key)).toBe(true);
  expect(isOnPage("page:other", key)).toBe(false);
  expect(isOnPage("page:main", "abc")).toBe(false);
  expect(elementIdOf("page:main", key)).toBe("abc");
});
