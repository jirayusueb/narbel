import type { ICache } from "../../../../shared/application/interfaces/ICache";
import type { IBoardRepository } from "../../application/ports/IBoardRepository";
import { Board } from "../../domain/entities/Board";
import type { Visibility } from "../../domain/values/Access";

const TTL_SECONDS = 60;
// longer than any fill takes, so a fill that began before a Trash transition sees the marker
const TRANSITION_MARK_SECONDS = 10;

export const boardKey = (id: string) => `board:${id}`;
export const userBoardsKey = (ownerId: string) => `boards:user:${ownerId}`;
const markKey = (key: string) => `mark:${key}`;

interface BoardRow {
  id: string;
  ownerId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  visibility: Visibility;
  passwordHash: string | null;
  trashedAt: string | null;
}

const toRow = (board: Board): BoardRow => ({
  id: board.id,
  ownerId: board.ownerId,
  title: board.title.value,
  createdAt: board.createdAt.toISOString(),
  updatedAt: board.updatedAt.toISOString(),
  visibility: board.visibility,
  passwordHash: board.passwordHash,
  trashedAt: board.trashedAt?.toISOString() ?? null,
});

const fromRow = (row: BoardRow) =>
  Board.restore({
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    trashedAt: row.trashedAt ? new Date(row.trashedAt) : null,
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
    const board = await this.findIncludingTrashed(id);
    return board?.trashedAt ? null : (board ?? null);
  }

  async findIncludingTrashed(id: string) {
    const hit = await this.cache.get<BoardRow>(boardKey(id));
    if (hit) {
      return fromRow(hit);
    }
    const board = await this.inner.findIncludingTrashed(id);
    if (board) {
      await this.fill(boardKey(id), toRow(board));
    }
    return board;
  }

  async listByOwner(ownerId: string) {
    const hit = await this.cache.get<BoardRow[]>(userBoardsKey(ownerId));
    if (hit) {
      return hit.map(fromRow);
    }
    const boards = await this.inner.listByOwner(ownerId);
    await this.fill(userBoardsKey(ownerId), boards.map(toRow));
    return boards;
  }

  // not cached: the Trash view is rarely opened and must show a just-trashed board at once
  listTrashedByOwner(ownerId: string) {
    return this.inner.listTrashedByOwner(ownerId);
  }
  // shared lists depend on access rows this class does not see, so they stay uncached
  listSharedWith(userId: string, email: string) {
    return this.inner.listSharedWith(userId, email);
  }

  async save(board: Board) {
    await this.inner.save(board);
    await this.cache.del(boardKey(board.id), userBoardsKey(board.ownerId));
  }

  async setTrashed(id: string, at: Date | null) {
    const board = await this.inner.findIncludingTrashed(id);
    if (!board) {
      return false;
    }
    const keys = [boardKey(id), userBoardsKey(board.ownerId)];
    await Promise.all(
      keys.map((key) =>
        this.cache.set(markKey(key), 1, TRANSITION_MARK_SECONDS)
      )
    );
    const moved = await this.inner.setTrashed(id, at);
    await this.cache.del(...keys);
    return moved;
  }

  async deleteTrashed(id: string) {
    const board = await this.inner.findIncludingTrashed(id);
    const removed = await this.inner.deleteTrashed(id);
    await this.cache.del(
      boardKey(id),
      ...(board ? [userBoardsKey(board.ownerId)] : [])
    );
    return removed;
  }

  /**
   * A fill that read the row before a Trash transition committed may write after the transition's
   * invalidation. The transition marks the keys first, so the fill checks the mark after writing and
   * takes its own entry back out.
   */
  private async fill(key: string, value: unknown) {
    await this.cache.set(key, value, TTL_SECONDS);
    if (await this.cache.get(markKey(key))) {
      await this.cache.del(key);
    }
  }
}
