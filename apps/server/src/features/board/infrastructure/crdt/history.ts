import { equalityDeep } from "lib0/function";
import * as Y from "yjs";

import { byZOrder } from "../../application/dtos/SceneDto";
import type {
  VersionFile,
  VersionScene,
} from "../../application/ports/IBoardHistory";
import type { Page } from "../../domain/entities/Page";
import type { SceneElement } from "../../domain/entities/SceneElement";
import { ensurePages } from "./pages";

/** Every image fileId any element (deleted ones included) references. */
export const fileIdsOf = (doc: Y.Doc): string[] => {
  const ids = new Set<string>();
  for (const element of doc.getMap<SceneElement>("elements").values()) {
    if (typeof element.fileId === "string") {
      ids.add(element.fileId);
    }
  }
  return [...ids];
};

/** A throwaway document holding `state`, with pages ensured; the caller destroys it. */
export const loadState = (state: Uint8Array) => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  ensurePages(doc, null);
  return doc;
};

export const readSnapshot = (state: Uint8Array): VersionScene => {
  const doc = loadState(state);
  try {
    const elements = Object.entries(
      doc.getMap<SceneElement>("elements").toJSON()
    );
    const files = doc.getMap<VersionFile>("files").toJSON();
    const used = new Set<string>();
    const pages = doc
      .getArray<Page>("pages")
      .toArray()
      .map((page) => {
        const onPage = elements
          .filter(
            ([key, element]) =>
              key.startsWith(`${page.id}:`) && !element.isDeleted
          )
          .map(([, element]) => element)
          .toSorted(byZOrder);
        for (const element of onPage) {
          if (typeof element.fileId === "string") {
            used.add(element.fileId);
          }
        }
        return { ...page, elements: onPage };
      });
    return {
      pages,
      files: [...used].flatMap((id) => (files[id] ? [files[id]] : [])),
    };
  } finally {
    doc.destroy();
  }
};

const STAMPS = new Set(["version", "versionNonce", "updated"]);
const withoutStamps = (element: SceneElement) =>
  Object.fromEntries(Object.entries(element).filter(([k]) => !STAMPS.has(k)));

const sameContent = (a: SceneElement, b: SceneElement) =>
  equalityDeep(withoutStamps(a), withoutStamps(b));

const pageOf = (key: string, ids: Iterable<string>) => {
  for (const id of ids) {
    if (key.startsWith(`${id}:`)) {
      return true;
    }
  }
  return false;
};

// Excalidraw's own range for a version nonce.
const nonce = () => Math.floor(Math.random() * 2 ** 31);

/**
 * Writes the difference between the live document and `target` into the live document as ordinary
 * operations, in one transaction. Nothing from the target's own history is replayed (applying an
 * old update to a newer document would leave every later key in place). Elements the target lacks
 * become tombstones, elements it has are rewritten with a higher version so Excalidraw's
 * "higher version wins" rule accepts them on every canvas. Pages follow the target; the files map
 * only grows, since an offline client may still reference any file in it.
 * Returns whether anything was written.
 */
export const restoreScene = (
  live: Y.Doc,
  target: Y.Doc,
  now: number,
  versionId: string
): boolean => {
  const pages = live.getArray<Page>("pages");
  const elements = live.getMap<SceneElement>("elements");
  const files = live.getMap<VersionFile>("files");
  const wantedPages = target.getArray<Page>("pages").toArray();
  const wanted = target.getMap<SceneElement>("elements").toJSON();
  const wantedFiles = target.getMap<VersionFile>("files").toJSON();
  const wantedIds = new Set(wantedPages.map((p) => p.id));
  const droppedIds = pages
    .toArray()
    .map((p) => p.id)
    .filter((id) => !wantedIds.has(id));
  let changed = false;
  live.transact(() => {
    if (!equalityDeep(pages.toArray(), wantedPages)) {
      pages.delete(0, pages.length);
      pages.push(wantedPages);
      changed = true;
    }
    for (const [key, current] of Object.entries(elements.toJSON())) {
      if (pageOf(key, droppedIds)) {
        elements.delete(key);
        changed = true;
      } else if (pageOf(key, wantedIds)) {
        const goal = wanted[key];
        if (!goal) {
          if (!current.isDeleted) {
            elements.set(key, {
              ...current,
              isDeleted: true,
              version: current.version + 1,
              versionNonce: nonce(),
              updated: now,
            });
            changed = true;
          }
        } else if (
          !((current.isDeleted && goal.isDeleted) || sameContent(current, goal))
        ) {
          elements.set(key, {
            ...goal,
            version: Math.max(current.version, goal.version) + 1,
            versionNonce: nonce(),
            updated: now,
          });
          changed = true;
        }
      }
    }
    for (const [key, goal] of Object.entries(wanted)) {
      if (!(elements.has(key) || goal.isDeleted || !pageOf(key, wantedIds))) {
        elements.set(key, {
          ...goal,
          version: goal.version + 1,
          versionNonce: nonce(),
          updated: now,
        });
        changed = true;
      }
    }
    for (const [id, meta] of Object.entries(wantedFiles)) {
      if (!files.has(id)) {
        files.set(id, meta);
        changed = true;
      }
    }
    if (changed) {
      // clients drop their undo history when this changes: an old undo step must not replay over a restore
      live.getMap("meta").set("restore", { versionId, at: now });
    }
  }, null);
  return changed;
};
