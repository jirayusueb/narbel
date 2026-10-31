import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useEffect } from "react";
import type * as Y from "yjs";

import { takeImport } from "./pending-import";

/**
 * Publishes an imported scene into its new board once the editor is live. The image bytes are already
 * in storage, so each file is registered before any element that references it is written.
 */
export const usePendingImport = ({
  boardId,
  api,
  doc,
  pageId,
  ready,
}: {
  boardId: string;
  api: ExcalidrawImperativeAPI | null;
  doc: Y.Doc | null;
  pageId: string | null;
  ready: boolean;
}) => {
  useEffect(() => {
    if (!(ready && api && doc && pageId)) {
      return;
    }
    const scene = takeImport(boardId);
    if (!scene) {
      return;
    }
    const files = doc.getMap<{ id: string; mimeType: string; created: number }>(
      "files"
    );
    doc.transact(() => {
      for (const file of scene.stored) {
        files.set(file.id, file);
      }
    });
    api.addFiles(scene.files);
    api.updateScene({
      elements: scene.elements,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    api.scrollToContent(scene.elements, { fitToContent: true });
  }, [ready, api, doc, boardId, pageId]);
};
