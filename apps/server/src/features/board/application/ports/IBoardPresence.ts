export interface Viewer {
  /** null for an anonymous share-link viewer */
  userId: string | null;
  name: string | null;
}

/** Who has a board open right now, shared by every server instance. Never throws: presence must not break sync. */
export interface IBoardPresence {
  join(boardId: string, connectionId: string, viewer: Viewer): Promise<void>;
  touch(boardId: string, connectionId: string): Promise<void>;
  leave(boardId: string, connectionId: string): Promise<void>;
  /** Empty when the store is unreachable. */
  list(boardId: string): Promise<Viewer[]>;
}
