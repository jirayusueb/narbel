import { expect, test } from "bun:test";

import { fromMarkdown, toMarkdown } from "./markdown";

test("markdown survives a TipTap round trip", () => {
  const md = [
    "# Title",
    "**bold** and *italic* and `code` and [site](https://example.com)",
    "- one\n- two",
    "1. first\n2. second",
  ].join("\n\n");
  expect(toMarkdown(fromMarkdown(md))).toBe(md);
});

test("literal markup characters stay text", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "a*b*c [x](y)" }] },
    ],
  };
  expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
});

test("unsafe link targets render as plain text", () => {
  const doc = fromMarkdown("[click](javascript:alert(1))");
  expect(JSON.stringify(doc)).not.toContain("javascript");
  expect(JSON.stringify(doc)).not.toContain('"link"');
});
