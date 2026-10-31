import { and, eq } from "@narbel/db";
import type { Database } from "@narbel/db";
import { boardFile } from "@narbel/db/schema/board";

import type { BoardFileDto } from "../../application/dtos/BoardFileDto";
import type { IBoardFileRepository } from "../../application/ports/IBoardFileRepository";

export class DrizzleBoardFileRepository implements IBoardFileRepository {
  constructor(private readonly db: Database) {}

  // A file the GC has claimed is gone for every reader, even while its bytes still exist.
  async findById(boardId: string, fileId: string) {
    const [row] = await this.db
      .select()
      .from(boardFile)
      .where(
        and(
          eq(boardFile.boardId, boardId),
          eq(boardFile.fileId, fileId),
          eq(boardFile.state, "live")
        )
      )
      .limit(1);
    return row
      ? { id: row.fileId, mimeType: row.mimeType, size: row.size }
      : null;
  }

  // Registering touches the row, which also keeps the GC's compare-and-set claim from winning
  // against it. A `deleting` row is never written: it reports false and the caller retries later.
  async save(boardId: string, file: BoardFileDto) {
    const written = await this.db
      .insert(boardFile)
      .values({
        boardId,
        fileId: file.id,
        mimeType: file.mimeType,
        size: file.size,
      })
      .onConflictDoUpdate({
        target: [boardFile.boardId, boardFile.fileId],
        set: { touchedAt: new Date(), orphanSince: null },
        setWhere: eq(boardFile.state, "live"),
      })
      .returning({ fileId: boardFile.fileId });
    return written.length > 0;
  }
}
