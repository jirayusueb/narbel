import { and, eq } from "@narbel/db";
import type { Database } from "@narbel/db";
import { boardFile } from "@narbel/db/schema/board";

import type { BoardFileDto } from "../../application/dtos/BoardFileDto";
import type { IBoardFileRepository } from "../../application/ports/IBoardFileRepository";

export class DrizzleBoardFileRepository implements IBoardFileRepository {
  constructor(private readonly db: Database) {}

  async find(boardId: string, fileId: string) {
    const [row] = await this.db
      .select()
      .from(boardFile)
      .where(and(eq(boardFile.boardId, boardId), eq(boardFile.fileId, fileId)))
      .limit(1);
    return row
      ? { id: row.fileId, mimeType: row.mimeType, size: row.size }
      : null;
  }

  async save(boardId: string, file: BoardFileDto) {
    await this.db
      .insert(boardFile)
      .values({
        boardId,
        fileId: file.id,
        mimeType: file.mimeType,
        size: file.size,
      })
      .onConflictDoNothing();
  }
}
