/** The searchable text of one element, one `board_text` row. */
export interface BoardText {
  pageId: string;
  elementId: string;
  text: string;
}

/** The `board_text` rows to write; `replaceAll` carries the full set and the store writes only what differs from its rows. */
export interface TextChange {
  replaceAll: boolean;
  upsert: BoardText[];
  remove: Pick<BoardText, "pageId" | "elementId">[];
}

export interface IBoardDocumentStore {
  load(boardId: string): Promise<Uint8Array | null>;
  /**
   * Persists the state together with the change to the search mirror of its text (none when unchanged).
   * Resolves to the owner of the board (for cache invalidation), or undefined if the board is gone.
   */
  save(
    boardId: string,
    state: Uint8Array,
    texts?: TextChange
  ): Promise<string | undefined>;
}
