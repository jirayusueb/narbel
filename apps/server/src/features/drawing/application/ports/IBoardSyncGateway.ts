/** Close code and reason a peer receives when its board was moved to Trash; the web client keys off the code. */
export const SYNC_CLOSE_TRASHED = { code: 4410, reason: "board-trashed" };
/** Close code (1008, policy violation) and reason a peer receives when a recheck finds it can no longer read the board. */
export const SYNC_CLOSE_REVOKED = { code: 1008, reason: "access-revoked" };

/** What a connected peer may do now: edit, only watch, or nothing (it is sent away). */
export type PeerAccess = "write" | "read" | "none";

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
  /**
   * A peer without `canWrite` receives the document but none of its updates are ever applied.
   * `recheck` decides the peer again whenever the board's access changes, on whichever instance holds it.
   */
  connect(
    boardId: string,
    peer: SyncPeer,
    canWrite: boolean,
    recheck: () => Promise<PeerAccess>
  ): Promise<SyncSession>;
}
