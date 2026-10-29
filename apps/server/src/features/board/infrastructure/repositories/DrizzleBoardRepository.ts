import { desc, eq, or } from "@narbel/db";
import type { Database } from "@narbel/db";
import { board, boardAccess } from "@narbel/db/schema/board";

import type { IBoardRepository } from "../../application/ports/IBoardRepository";
import { Board } from "../../domain/entities/Board";

type BoardRow = typeof board.$inferSelect;

const toDomain = (row: BoardRow) => Board.restore(row);

export class DrizzleBoardRepository implements IBoardRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string) {
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
      .where(eq(board.ownerId, ownerId))
      .orderBy(desc(board.updatedAt));
    return rows.map(toDomain);
  }

  async listSharedWith(userId: string, email: string) {
    const rows = await this.db
      .select({ board, role: boardAccess.role })
      .from(boardAccess)
      .innerJoin(board, eq(board.id, boardAccess.boardId))
      .where(
        or(
          eq(boardAccess.userId, userId),
          eq(boardAccess.email, email.toLowerCase())
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

  async delete(id: string) {
    await this.db.delete(board).where(eq(board.id, id));
  }
}
