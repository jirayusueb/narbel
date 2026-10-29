export interface SyncPeer {
  send(message: Uint8Array): void;
  /** Forcibly disconnects the peer, e.g. when its board is deleted. */
  close(): void;
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
