import { generateKeyBetween } from "fractional-indexing";
import type * as Y from "yjs";

import {
  toElement,
  toExcalidraw,
} from "../../application/dtos/ExcalidrawElement";
import type { ExcalidrawElement } from "../../application/dtos/ExcalidrawElement";
import type { SceneAccess } from "../../application/ports/IBoardScenes";
import { MAIN_PAGE, elementKey } from "../../domain/entities/Page";
import type { Page } from "../../domain/entities/Page";
import { shouldAcceptIncoming } from "../../domain/rules/mergeElement";
import { touchesSince } from "./changes";

/**
 * Every doc gets at least one page. A v1 doc has bare element keys and no pages:
 * those elements move onto the main page in one transaction. Returns whether the doc changed.
 */
export const ensurePages = (doc: Y.Doc, origin: unknown): boolean => {
  const pages = doc.getArray<Page>("pages");
  if (pages.length > 0) {
    return false;
  }
  const elements = doc.getMap<ExcalidrawElement>("elements");
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

export const TOMBSTONE_TTL_MS = 24 * 60 * 60 * 1000;

const isExpiredTombstone = (value: unknown, cutoff: number) =>
  typeof value === "object" &&
  value !== null &&
  "isDeleted" in value &&
  value.isDeleted === true &&
  "updated" in value &&
  typeof value.updated === "number" &&
  value.updated < cutoff;

// A key delete creates no Item, so it cannot beat a concurrent offline edit or undo.
export const pruneTombstones = (
  doc: Y.Doc,
  now: number,
  origin: unknown
): number => {
  const elements = doc.getMap<unknown>("elements");
  const cutoff = now - TOMBSTONE_TTL_MS;
  const expired: string[] = [];
  for (const [key, value] of elements) {
    if (isExpiredTombstone(value, cutoff)) {
      expired.push(key);
    }
  }
  doc.transact(() => {
    for (const key of expired) {
      elements.delete(key);
    }
  }, origin);
  return expired.length;
};

const orderKeyOf = (element: ExcalidrawElement | undefined) =>
  typeof element?.index === "string" ? element.index : undefined;

/**
 * Excalidraw's z-order key (fractional `index`) for an element new to the page: a label goes
 * right above its container, a frame's child right below its frame (Excalidraw draws
 * `[child, child, frame]`), anything else on top. Clients would otherwise each invent one
 * from their own element order and overwrite each other's.
 */
const newOrderKey = (
  keys: string[],
  container: ExcalidrawElement | undefined,
  frame: ExcalidrawElement | undefined
) => {
  const containerKey = orderKeyOf(container);
  const frameKey = orderKeyOf(frame);
  if (containerKey === undefined && frameKey !== undefined) {
    let lower: string | null = null;
    for (const key of keys) {
      if (key < frameKey && (lower === null || key > lower)) {
        lower = key;
      }
    }
    return generateKeyBetween(lower, frameKey);
  }
  let bound: string | null = null;
  for (const key of keys) {
    const higher = bound === null || key > bound;
    const lowerAbove =
      containerKey !== undefined &&
      key > containerKey &&
      (bound === null || key < bound);
    if (containerKey === undefined ? higher : lowerAbove) {
      bound = key;
    }
  }
  // no container: above the topmost key; label: between its container and the next key up
  return containerKey === undefined
    ? generateKeyBetween(bound, null)
    : generateKeyBetween(containerKey, bound);
};

export const sceneAccess = (doc: Y.Doc): SceneAccess => {
  const pages = doc.getArray<Page>("pages");
  const elements = doc.getMap<ExcalidrawElement>("elements");
  const files = doc.getMap<unknown>("files");
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
    get: (pageId, id) => {
      const stored = elements.get(elementKey(pageId, id));
      return stored && toElement(stored);
    },
    all: (pageId) =>
      [...elements.entries()]
        .filter(([key]) => key.startsWith(`${pageId}:`))
        .map(([, element]) => toElement(element)),
    locate: (id) => {
      const page = pages
        .toArray()
        .find((p) => elements.has(elementKey(p.id, id)));
      const stored = page && elements.get(elementKey(page.id, id));
      return page && stored && { pageId: page.id, element: toElement(stored) };
    },
    ensureFile: (file) => {
      if (!files.has(file.id)) {
        files.set(file.id, file);
      }
    },
    put: (pageId, element) => {
      const key = elementKey(pageId, element.id);
      const current = elements.get(key);
      const container =
        typeof element.containerId === "string"
          ? elements.get(elementKey(pageId, element.containerId))
          : undefined;
      const frame =
        typeof element.frameId === "string"
          ? elements.get(elementKey(pageId, element.frameId))
          : undefined;
      // an update keeps the key it has, so editing never reorders
      const ordered =
        current || element.index !== undefined
          ? element
          : {
              ...element,
              index: newOrderKey(pageKeys(pageId), container, frame),
            };
      if (shouldAcceptIncoming(current, ordered)) {
        elements.set(key, toExcalidraw(ordered));
      }
    },
    changesSince: (since) => touchesSince(doc, since),
  };
};
