import type * as Y from "yjs";

import type { ExcalidrawElement } from "../../application/dtos/ExcalidrawElement";
import type { BoardText } from "../../application/ports/IBoardDocumentStore";

/**
 * The searchable text of a document: live text elements, shape labels included (they are
 * text elements bound to their container). Keys are `<pageId>:<elementId>` and page ids
 * contain colons, so the page is whatever precedes the element id.
 */
export const extractBoardText = (doc: Y.Doc): BoardText[] =>
  [...doc.getMap<ExcalidrawElement>("elements").entries()].flatMap(
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

export type TextIndex = Map<string, BoardText>;

export const indexTexts = (texts: BoardText[]): TextIndex =>
  new Map(
    texts.map((entry) => [`${entry.pageId}\u0000${entry.elementId}`, entry])
  );

/** True when `next` holds exactly the texts last published; an unknown set (`undefined`) never matches. */
export const sameTexts = (written: TextIndex | undefined, next: TextIndex) =>
  written?.size === next.size &&
  [...next].every(([key, entry]) => written.get(key)?.text === entry.text);
