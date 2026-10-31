import type { ICache } from "../../../../shared/application/interfaces/ICache";
import type {
  DocumentCheckpoint,
  IBoardDocumentStore,
  TextChange,
} from "../../application/ports/IBoardDocumentStore";
import { boardKey, userBoardsKey } from "./CachedBoardRepository";

/** Saving a document bumps the board's updatedAt, so the cached board and its owner's list go stale. */
export class CachedBoardDocumentStore implements IBoardDocumentStore {
  constructor(
    private readonly inner: IBoardDocumentStore,
    private readonly cache: ICache
  ) {}

  load(boardId: string) {
    return this.inner.load(boardId);
  }

  async save(
    boardId: string,
    state: Uint8Array,
    texts?: TextChange,
    checkpoint?: DocumentCheckpoint
  ) {
    const ownerId = await this.inner.save(boardId, state, texts, checkpoint);
    await this.cache.del(
      boardKey(boardId),
      ...(ownerId ? [userBoardsKey(ownerId)] : [])
    );
    return ownerId;
  }
}
