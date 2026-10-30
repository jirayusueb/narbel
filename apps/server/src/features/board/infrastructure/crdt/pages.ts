import { generateKeyBetween } from "fractional-indexing";
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

const orderKeyOf = (element: SceneElement | undefined) =>
  typeof element?.index === "string" ? element.index : undefined;

/**
 * Excalidraw's z-order key (fractional `index`) for an element new to the page: a label goes
 * right above its container, anything else on top. Clients would otherwise each invent one
 * from their own element order and overwrite each other's.
 */
const newOrderKey = (keys: string[], container: SceneElement | undefined) => {
  const below = orderKeyOf(container);
  let bound: string | null = null;
  for (const key of keys) {
    const higher = bound === null || key > bound;
    const lowerAbove =
      below !== undefined && key > below && (bound === null || key < bound);
    if (below === undefined ? higher : lowerAbove) {
      bound = key;
    }
  }
  // no container: above the topmost key; label: between its container and the next key up
  return below === undefined
    ? generateKeyBetween(bound, null)
    : generateKeyBetween(below, bound);
};

export const sceneAccess = (doc: Y.Doc): SceneAccess => {
  const pages = doc.getArray<Page>("pages");
  const elements = doc.getMap<SceneElement>("elements");
  const pageKeys = (pageId: string) =>
    [...elements.entries()].flatMap(([key, element]) => {
      const order = orderKeyOf(element);
      return key.startsWith(`${pageId}:`) && order !== undefined ? [order] : [];
    });
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
      const current = elements.get(key);
      const container =
        typeof element.containerId === "string"
          ? elements.get(elementKey(pageId, element.containerId))
          : undefined;
      // an update keeps the key it has, so editing never reorders
      const ordered =
        current || orderKeyOf(element) !== undefined
          ? element
          : { ...element, index: newOrderKey(pageKeys(pageId), container) };
      if (shouldAcceptIncoming(current, ordered)) {
        elements.set(key, ordered);
      }
    },
  };
};
