import type { Page } from "../../domain/entities/Page";
import type { SceneElement } from "../../domain/entities/SceneElement";

/** Synchronous view over one board's shared CRDT document, valid only inside `transact`. */
export interface SceneAccess {
  pages(): Page[];
  addPage(page: Page): void;
  renamePage(id: string, name: string): boolean;
  /** Removes the page together with every element on it. */
  removePage(id: string): boolean;
  get(pageId: string, id: string): SceneElement | undefined;
  all(pageId: string): SceneElement[];
  /** Finds an element on any page; element ids are unique per board. */
  find(id: string): { pageId: string; element: SceneElement } | undefined;
  /** Writes the element if it wins the merge rule against the stored one. */
  put(pageId: string, element: SceneElement): void;
  /** Registers an uploaded image in the document's file map for browsers; an existing entry stays. */
  putFile(file: { id: string; mimeType: string; created: number }): void;
}

export interface IBoardScenes {
  /** Runs `fn` as one atomic CRDT transaction on the live document, loading it if needed. */
  transact<T>(boardId: string, fn: (scene: SceneAccess) => T): Promise<T>;
  /**
   * Element ids selected by the client that changed its selection last, or undefined
   * when nobody is connected.
   */
  getSelection(boardId: string): Promise<string[] | undefined>;
  /** Publishes a selection as an extra "MCP" collaborator that connected browsers see. */
  setSelection(boardId: string, ids: string[]): Promise<void>;
  /** Drops the live document and its connections without persisting (the board is gone). */
  discard(boardId: string): Promise<void>;
}
