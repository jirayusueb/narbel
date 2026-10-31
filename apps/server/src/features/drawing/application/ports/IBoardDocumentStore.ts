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

/** Lets a save also take a history checkpoint of the state it persists, when one is due. */
export interface DocumentCheckpoint {
  /** every image fileId the state references */
  fileIds: string[];
}

export interface IBoardDocumentStore {
  load(boardId: string): Promise<Uint8Array | null>;
  /**
   * Persists the state together with the change to the search mirror of its text (none when unchanged)
   * and, in the same transaction, an automatic history version when the last one is old enough.
   * The board's last-edit time moves in the same transaction.
   */
  save(
    boardId: string,
    state: Uint8Array,
    texts?: TextChange,
    checkpoint?: DocumentCheckpoint
  ): Promise<void>;
}

/** Every stored row of one board's drawing: its document, history versions and image records. */
export interface IDrawingRows {
  deleteAll(boardId: string): Promise<void>;
}
