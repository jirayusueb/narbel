import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type * as Y from "yjs";

import { isOnPage } from "@/entities/drawing";

export const fileIdsOnPage = (
  elements: Y.Map<ExcalidrawElement>,
  pageId: string
) => {
  const ids = new Set<string>();
  for (const [key, element] of elements) {
    if (
      element.type === "image" &&
      !element.isDeleted &&
      element.fileId &&
      isOnPage(pageId, key)
    ) {
      ids.add(element.fileId);
    }
  }
  return ids;
};
