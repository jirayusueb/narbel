import { desc, eq } from "@narbel/db";
import type { Database } from "@narbel/db";
import { board } from "@narbel/db/schema/board";

import type { IBoardRepository } from "../../application/ports/IBoardRepository";
import { Board } from "../../domain/entities/Board";

type BoardRow = typeof board.$inferSelect;

const toDomain = (row: BoardRow) =>
  Board.restore(row.id, row.ownerId, row.title, row.createdAt, row.updatedAt);

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

  async save(entity: Board) {
    const values = {
      id: entity.id,
      ownerId: entity.ownerId,
      title: entity.title.value,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
    await this.db
      .insert(board)
      .values(values)
      .onConflictDoUpdate({
        target: board.id,
        set: { title: values.title, updatedAt: values.updatedAt },
      });
  }

  async delete(id: string) {
    await this.db.delete(board).where(eq(board.id, id));
  }
}
