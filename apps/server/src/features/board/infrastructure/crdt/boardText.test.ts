import { describe, expect, it } from "bun:test";

import * as Y from "yjs";

import { extractBoardText } from "./boardText";

const docWith = (elements: Record<string, Record<string, unknown>>) => {
  const doc = new Y.Doc();
  const map = doc.getMap("elements");
  for (const [key, element] of Object.entries(elements)) {
    map.set(key, element);
  }
  return doc;
};

describe("extractBoardText", () => {
  it("returns live text and shape labels with their page, skipping deleted and non-text elements", () => {
    const doc = docWith({
      "page:main:a": { id: "a", type: "text", text: "Hello" },
      "page:two:b": {
        id: "b",
        type: "text",
        text: "สวัสดี\nชาวโลก",
        originalText: "สวัสดีชาวโลก",
        containerId: "r",
      },
      "page:two:c": { id: "c", type: "text", text: "gone", isDeleted: true },
      "page:two:r": { id: "r", type: "rectangle" },
      "page:two:d": { id: "d", type: "text", text: "  " },
    });
    expect(extractBoardText(doc)).toEqual([
      { pageId: "page:main", elementId: "a", text: "Hello" },
      { pageId: "page:two", elementId: "b", text: "สวัสดีชาวโลก" },
    ]);
  });
});
