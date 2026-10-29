import type { ICache } from "../../../../shared/application/interfaces/ICache";
import { boardKey, userBoardsKey } from "./CachedBoardRepository";
import type { IBoardDocumentStore } from "./DrizzleBoardDocumentStore";

/** Saving a document bumps the board's updatedAt, so the cached board and its owner's list go stale. */
export class CachedBoardDocumentStore implements IBoardDocumentStore {
  constructor(
    private readonly inner: IBoardDocumentStore,
    private readonly cache: ICache
  ) {}

  load(boardId: string) {
    return this.inner.load(boardId);
  }

  async save(boardId: string, state: Uint8Array) {
    const ownerId = await this.inner.save(boardId, state);
    await this.cache.del(
      boardKey(boardId),
      ...(ownerId ? [userBoardsKey(ownerId)] : [])
    );
    return ownerId;
  }
}
