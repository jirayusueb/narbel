import type { SceneElement } from "../../domain/entities/SceneElement";

/** Synchronous view over one board's shared CRDT document, valid only inside `transact`. */
export interface SceneAccess {
  get(id: string): SceneElement | undefined;
  all(): SceneElement[];
  /** Writes the element if it wins the merge rule against the stored one. */
  put(element: SceneElement): void;
}

export interface IBoardScenes {
  /** Runs `fn` as one atomic CRDT transaction on the live document, loading it if needed. */
  transact<T>(boardId: string, fn: (scene: SceneAccess) => T): Promise<T>;
  /** Drops the live document and its connections without persisting (the board is gone). */
  discard(boardId: string): Promise<void>;
}
