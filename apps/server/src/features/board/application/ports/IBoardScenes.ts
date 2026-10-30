import type { Page } from "../../domain/entities/Page";
import type { SceneElement } from "../../domain/entities/SceneElement";
import type { SceneVersion } from "../../domain/values/ChangeCursor";

/** One element key a human wrote after the cursor, as the document holds it now. */
export interface ElementTouch {
  pageId: string;
  /** current value; `isDeleted: true` when the human's last act was deleting it */
  element: SceneElement;
  /** whether the key held a value at the cursor (false = created after it) */
  existedAtCursor: boolean;
}

export interface SceneChanges {
  touches: ElementTouch[];
  /** position of the document now, merged with the given one so nothing is reported twice */
  version: SceneVersion;
}

/** What the MCP collaborator points at. */
export interface AgentSelection {
  /** page of the first live selected element; undefined when nothing was found */
  pageId: string | undefined;
  ids: string[];
  /** true for `focus`: connected viewers bring the selection into view once */
  reveal: boolean;
}

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
  ensureFile(file: { id: string; mimeType: string; created: number }): void;
  /**
   * Element keys at least one non-agent client wrote after `since` (null = now: no touches).
   * Undefined when `since` is not a decodable version.
   * Elements removed by deleting their whole page are not reported (the key is deleted, no new write).
   */
  changesSince(since: SceneVersion | null): SceneChanges | undefined;
}

export interface IBoardScenes {
  /** Runs `fn` as one atomic CRDT transaction on the live document, loading it if needed. */
  transact<T>(boardId: string, fn: (scene: SceneAccess) => T): Promise<T>;
  /**
   * Element ids selected by the client that changed its selection last, or undefined
   * when nobody is connected.
   */
  getSelection(boardId: string): Promise<string[] | undefined>;
  /** Publishes the selection as the "MCP" collaborator on `pageId`, outlined in every browser on that page. */
  setSelection(boardId: string, selection: AgentSelection): Promise<void>;
  /** Drops the live document and its connections without persisting (the board is gone). */
  discard(boardId: string): Promise<void>;
}
