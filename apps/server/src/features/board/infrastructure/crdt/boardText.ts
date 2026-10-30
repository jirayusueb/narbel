import type * as Y from "yjs";

import type {
  BoardText,
  TextChange,
} from "../../application/ports/IBoardDocumentStore";
import type { SceneElement } from "../../domain/entities/SceneElement";

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

export type TextIndex = Map<string, BoardText>;

export const indexTexts = (texts: BoardText[]): TextIndex =>
  new Map(
    texts.map((entry) => [`${entry.pageId}\u0000${entry.elementId}`, entry])
  );

export const replaceAllTexts = (texts: BoardText[]): TextChange => ({
  replaceAll: true,
  upsert: texts,
  remove: [],
});

/**
 * What to write given the rows last written (undefined when unknown, which hands over the full
 * set), or undefined when the stored text is already current.
 */
export const diffTexts = (
  written: TextIndex | undefined,
  next: TextIndex
): TextChange | undefined => {
  if (!written) {
    return replaceAllTexts([...next.values()]);
  }
  const upsert = [...next].filter(
    ([key, entry]) => written.get(key)?.text !== entry.text
  );
  const remove = [...written].filter(([key]) => !next.has(key));
  return upsert.length === 0 && remove.length === 0
    ? undefined
    : {
        replaceAll: false,
        upsert: upsert.map(([, entry]) => entry),
        remove: remove.map(([, { pageId, elementId }]) => ({
          pageId,
          elementId,
        })),
      };
};
