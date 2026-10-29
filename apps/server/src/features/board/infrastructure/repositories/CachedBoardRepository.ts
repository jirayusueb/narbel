import type { ICache } from "../../../../shared/application/interfaces/ICache";
import type { IBoardRepository } from "../../application/ports/IBoardRepository";
import { Board } from "../../domain/entities/Board";
import type { Visibility } from "../../domain/values/Access";

const TTL_SECONDS = 60;

export const boardKey = (id: string) => `board:${id}`;
export const userBoardsKey = (ownerId: string) => `boards:user:${ownerId}`;

interface BoardRow {
  id: string;
  ownerId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  visibility: Visibility;
  passwordHash: string | null;
}

const toRow = (board: Board): BoardRow => ({
  id: board.id,
  ownerId: board.ownerId,
  title: board.title.value,
  createdAt: board.createdAt.toISOString(),
  updatedAt: board.updatedAt.toISOString(),
  visibility: board.visibility,
  passwordHash: board.passwordHash,
});

const fromRow = (row: BoardRow) =>
  Board.restore({
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  });

/**
 * Cache-aside over the board table. Every write goes through `save`/`delete` here (or invalidates
 * via CachedBoardDocumentStore), so deleting the keys is enough for all instances sharing the cache.
 * Misses are never cached; the TTL bounds a read that races an invalidation.
 */
export class CachedBoardRepository implements IBoardRepository {
  constructor(
    private readonly inner: IBoardRepository,
    private readonly cache: ICache
  ) {}

  async findById(id: string) {
    const hit = await this.cache.get<BoardRow>(boardKey(id));
    if (hit) {
      return fromRow(hit);
    }
    const board = await this.inner.findById(id);
    if (board) {
      await this.cache.set(boardKey(id), toRow(board), TTL_SECONDS);
    }
    return board;
  }

  async listByOwner(ownerId: string) {
    const hit = await this.cache.get<BoardRow[]>(userBoardsKey(ownerId));
    if (hit) {
      return hit.map(fromRow);
    }
    const boards = await this.inner.listByOwner(ownerId);
    await this.cache.set(userBoardsKey(ownerId), boards.map(toRow), TTL_SECONDS);
    return boards;
  }

  // shared lists depend on access rows this class does not see, so they stay uncached
  listSharedWith(userId: string, email: string) {
    return this.inner.listSharedWith(userId, email);
  }

  async save(board: Board) {
    await this.inner.save(board);
    await this.cache.del(boardKey(board.id), userBoardsKey(board.ownerId));
  }

  async delete(id: string) {
    const board = await this.inner.findById(id);
    await this.inner.delete(id);
    await this.cache.del(
      boardKey(id),
      ...(board ? [userBoardsKey(board.ownerId)] : [])
    );
  }
}
