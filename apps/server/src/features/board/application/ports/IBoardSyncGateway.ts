/** Close code and reason a peer receives when its board was moved to Trash; the web client keys off the code. */
export const SYNC_CLOSE_TRASHED = { code: 4410, reason: "board-trashed" };

export interface SyncPeer {
  send(message: Uint8Array): void;
  close(code?: number, reason?: string): void;
}

export interface SyncSession {
  receive(message: Uint8Array): void;
  close(): void;
}

/** Speaks the realtime sync protocol for one connected peer. */
export interface IBoardSyncGateway {
  /** A peer without `canWrite` receives the document but none of its updates are ever applied. */
  connect(
    boardId: string,
    peer: SyncPeer,
    canWrite: boolean
  ): Promise<SyncSession>;
}
