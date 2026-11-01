import { and, desc, eq, isNotNull, isNull, or } from "@narbel/db";
import type { DbExecutor } from "@narbel/db";
import { board, boardAccess } from "@narbel/db/schema/boards";

import type { IBoardRepository } from "../../application/ports/IBoardRepository";
import { Board } from "../../domain/entities/Board";

type BoardRow = typeof board.$inferSelect;

const toDomain = (row: BoardRow) => Board.restore(row);

export class DrizzleBoardRepository implements IBoardRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(board)
      .where(and(eq(board.id, id), isNull(board.trashedAt)))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findIncludingTrashed(id: string) {
    const [row] = await this.db
      .select()
      .from(board)
      .where(eq(board.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async listByOwner(ownerId: string) {
    const rows = await this.db
      .select()
      .from(board)
      .where(and(eq(board.ownerId, ownerId), isNull(board.trashedAt)))
      .orderBy(desc(board.updatedAt));
    return rows.map(toDomain);
  }

  async listTrashedByOwner(ownerId: string) {
    const rows = await this.db
      .select()
      .from(board)
      .where(and(eq(board.ownerId, ownerId), isNotNull(board.trashedAt)))
      .orderBy(desc(board.trashedAt));
    return rows.map(toDomain);
  }

  async listSharedWith(userId: string, email: string) {
    const rows = await this.db
      .select({ board, role: boardAccess.role })
      .from(boardAccess)
      .innerJoin(board, eq(board.id, boardAccess.boardId))
      .where(
        and(
          isNull(board.trashedAt),
          or(
            eq(boardAccess.userId, userId),
            eq(boardAccess.email, email.toLowerCase())
          )
        )
      )
      .orderBy(desc(board.updatedAt));
    return rows.map((row) => ({ board: toDomain(row.board), role: row.role }));
  }

  async save(entity: Board) {
    const values = {
      id: entity.id,
      ownerId: entity.ownerId,
      title: entity.title.value,
      visibility: entity.visibility,
      passwordHash: entity.passwordHash,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
    // trashedAt is deliberately not written here: only setTrashed moves a board in or out of Trash
    await this.db
      .insert(board)
      .values(values)
      .onConflictDoUpdate({
        target: board.id,
        set: {
          title: values.title,
          visibility: values.visibility,
          passwordHash: values.passwordHash,
          updatedAt: values.updatedAt,
        },
      });
  }

  async markEdited(id: string, at: Date) {
    const [row] = await this.db
      .update(board)
      .set({ updatedAt: at })
      .where(eq(board.id, id))
      .returning({ ownerId: board.ownerId });
    return row?.ownerId;
  }

  async setTrashed(id: string, at: Date | null) {
    const moved = await this.db
      .update(board)
      .set({ trashedAt: at })
      .where(
        and(
          eq(board.id, id),
          at === null ? isNotNull(board.trashedAt) : isNull(board.trashedAt)
        )
      )
      .returning({ id: board.id });
    return moved.length > 0;
  }

  async deleteTrashed(id: string) {
    const removed = await this.db
      .delete(board)
      .where(and(eq(board.id, id), isNotNull(board.trashedAt)))
      .returning({ id: board.id });
    return removed.length > 0;
  }
}
