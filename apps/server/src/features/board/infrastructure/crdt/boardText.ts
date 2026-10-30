import type * as Y from "yjs";

import type { SceneElement } from "../../domain/entities/SceneElement";

export interface BoardText {
  pageId: string;
  elementId: string;
  text: string;
}

/**
 * The searchable text of a document: live text elements, shape labels included (they are
 * text elements bound to their container). Keys are `<pageId>:<elementId>` and page ids
 * contain colons, so the page is whatever precedes the element id.
 */
export const extractBoardText = (doc: Y.Doc): BoardText[] =>
  [...doc.getMap<SceneElement>("elements").entries()].flatMap(
    ([key, element]) => {
      // originalText is the unwrapped text; text has line breaks inserted by wrapping
      const text = element.originalText ?? element.text;
      const suffix = `:${element.id}`;
      return element.type === "text" &&
        !element.isDeleted &&
        typeof text === "string" &&
        text.trim() !== "" &&
        key.endsWith(suffix)
        ? [
            {
              pageId: key.slice(0, -suffix.length),
              elementId: element.id,
              text,
            },
          ]
        : [];
    }
  );
