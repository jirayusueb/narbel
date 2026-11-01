import type { BoardId } from "../../../../shared/kernel/types/ids";

export type VersionKind = "auto" | "pre_restore";

export interface VersionInfo {
  id: string;
  kind: VersionKind;
  createdAt: Date;
  createdById: string | null;
}

export interface StoredVersion extends VersionInfo {
  /** the full Yjs state of the board when the version was taken */
  state: Uint8Array;
}

export interface NewVersion {
  kind: VersionKind;
  state: Uint8Array;
  /** every image fileId the state references, so file cleanup keeps what history still needs */
  fileIds: string[];
  createdById?: string | undefined;
}

export interface IBoardVersions {
  /** Newest first, without the state bytes. */
  list(boardId: BoardId): Promise<VersionInfo[]>;
  /** Scoped to the board: another board's version id finds nothing. */
  findInBoard(boardId: BoardId, id: string): Promise<StoredVersion | null>;
  record(boardId: BoardId, version: NewVersion): Promise<void>;
}
