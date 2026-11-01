/** The searchable text of one element: live text elements, shape labels included. */
export interface BoardText {
  pageId: string;
  elementId: string;
  text: string;
}

/** Lets a save also take a history checkpoint of the state it persists, when one is due. */
export interface DocumentCheckpoint {
  /** every image fileId the state references */
  fileIds: string[];
}

export interface IBoardDocumentStore {
  load(boardId: string): Promise<Uint8Array | null>;
  /**
   * Persists the state and, in the same transaction, an automatic history version when the last
   * one is old enough. `texts`, the board's full text set when it changed (omitted otherwise), goes
   * out as `event.drawing-text-changed` in the same transaction. The board's last-edit time moves
   * in the same transaction.
   */
  save(
    boardId: string,
    state: Uint8Array,
    texts?: BoardText[],
    checkpoint?: DocumentCheckpoint
  ): Promise<void>;
}

/** Every stored row of one board's drawing: its document, history versions and image records. */
export interface IDrawingRows {
  deleteAll(boardId: string): Promise<void>;
}
