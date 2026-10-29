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
  connect(boardId: string, peer: SyncPeer): Promise<SyncSession>;
}
