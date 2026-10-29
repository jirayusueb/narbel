import type * as Y from "yjs";

import type { SceneAccess } from "../../application/ports/IBoardScenes";
import { MAIN_PAGE, elementKey } from "../../domain/entities/Page";
import type { Page } from "../../domain/entities/Page";
import type { SceneElement } from "../../domain/entities/SceneElement";
import { shouldAcceptIncoming } from "../../domain/rules/mergeElement";

/**
 * Every doc gets at least one page. A v1 doc has bare element keys and no pages:
 * those elements move onto the main page in one transaction. Returns whether the doc changed.
 */
export const ensurePages = (doc: Y.Doc, origin: unknown): boolean => {
  const pages = doc.getArray<Page>("pages");
  if (pages.length > 0) {
    return false;
  }
  const elements = doc.getMap<SceneElement>("elements");
  doc.transact(() => {
    pages.push([MAIN_PAGE]);
    // snapshot first: setting keys while iterating the live map would revisit them
    for (const [key, element] of Object.entries(elements.toJSON())) {
      elements.delete(key);
      elements.set(elementKey(MAIN_PAGE.id, key), element);
    }
  }, origin);
  return true;
};

export const sceneAccess = (doc: Y.Doc): SceneAccess => {
  const pages = doc.getArray<Page>("pages");
  const elements = doc.getMap<SceneElement>("elements");
  const indexOf = (id: string) => pages.toArray().findIndex((p) => p.id === id);
  return {
    pages: () => pages.toArray(),
    addPage: (page) => {
      pages.push([page]);
    },
    renamePage: (id, name) => {
      const index = indexOf(id);
      if (index < 0) {
        return false;
      }
      pages.delete(index, 1);
      pages.insert(index, [{ id, name }]);
      return true;
    },
    removePage: (id) => {
      const index = indexOf(id);
      if (index < 0) {
        return false;
      }
      pages.delete(index, 1);
      const prefix = `${id}:`;
      for (const key of Object.keys(elements.toJSON())) {
        if (key.startsWith(prefix)) {
          elements.delete(key);
        }
      }
      return true;
    },
    get: (pageId, id) => elements.get(elementKey(pageId, id)),
    all: (pageId) =>
      [...elements.entries()]
        .filter(([key]) => key.startsWith(`${pageId}:`))
        .map(([, element]) => element),
    find: (id) => {
      const page = pages
        .toArray()
        .find((p) => elements.has(elementKey(p.id, id)));
      const element = page && elements.get(elementKey(page.id, id));
      return page && element && { pageId: page.id, element };
    },
    put: (pageId, element) => {
      const key = elementKey(pageId, element.id);
      if (shouldAcceptIncoming(elements.get(key), element)) {
        elements.set(key, element);
      }
    },
  };
};
