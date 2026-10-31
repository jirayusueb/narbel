import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";

export interface PendingImport {
  elements: ExcalidrawElement[];
  /** bytes for the local canvas */
  files: BinaryFileData[];
  /** files whose upload to storage already succeeded, ready to register on the board */
  stored: { id: string; mimeType: string; created: number }[];
}

// Memory only: the editor takes the scene right after the dashboard navigates there.
const pending = new Map<string, PendingImport>();

export const stashImport = (boardId: string, scene: PendingImport) => {
  pending.set(boardId, scene);
};

/** Hands the scene over once; a second call gets nothing. */
export const takeImport = (boardId: string) => {
  const scene = pending.get(boardId);
  pending.delete(boardId);
  return scene;
};
