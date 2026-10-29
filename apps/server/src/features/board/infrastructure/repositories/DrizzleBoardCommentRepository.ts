import { and, asc, eq } from "@narbel/db";
import type { Database } from "@narbel/db";
import { comment } from "@narbel/db/schema/board";

import type { IBoardCommentRepository } from "../../application/ports/IBoardCommentRepository";
import type { Comment } from "../../domain/entities/Comment";

export class DrizzleBoardCommentRepository implements IBoardCommentRepository {
  constructor(private readonly db: Database) {}

  async list(boardId: string, pageId?: string) {
    return await this.db
      .select()
      .from(comment)
      .where(
        pageId === undefined
          ? eq(comment.boardId, boardId)
          : and(eq(comment.boardId, boardId), eq(comment.pageId, pageId))
      )
      .orderBy(asc(comment.createdAt));
  }

  async findById(boardId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(comment)
      .where(and(eq(comment.boardId, boardId), eq(comment.id, id)))
      .limit(1);
    return row ?? null;
  }

  async save(entity: Comment) {
    await this.db
      .insert(comment)
      .values(entity)
      .onConflictDoUpdate({
        target: comment.id,
        set: { resolvedAt: entity.resolvedAt },
      });
  }

  async delete(boardId: string, id: string) {
    await this.db
      .delete(comment)
      .where(and(eq(comment.boardId, boardId), eq(comment.id, id)));
  }
}
