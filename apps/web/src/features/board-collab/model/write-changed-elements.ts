import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type * as Y from "yjs";

import { elementKey } from "@/entities/drawing";

import { shouldTakeIncoming } from "./merge";

export const writeChangedElements = (
  doc: Y.Doc,
  page: string,
  scene: readonly ExcalidrawElement[],
  sent: Map<string, number>,
  origin: unknown
) => {
  const changed = scene.filter((el) => sent.get(el.id) !== el.version);
  if (changed.length === 0) {
    return;
  }
  const elements = doc.getMap<ExcalidrawElement>("elements");
  doc.transact(() => {
    for (const el of changed) {
      sent.set(el.id, el.version);
      const key = elementKey(page, el.id);
      if (shouldTakeIncoming(elements.get(key), el)) {
        // Excalidraw mutates elements in place; storing the live object would let the
        // map's copy change silently and make later versions look already-synced.
        elements.set(key, { ...el });
      }
    }
  }, origin);
};
