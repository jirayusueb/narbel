import type { Versioned } from "../rules/mergeElement";

/** A plain-JSON Excalidraw element as stored in the shared document. */
export type SceneElement = Versioned & {
  id: string;
  type: string;
  isDeleted?: boolean;
  [key: string]: unknown;
};
