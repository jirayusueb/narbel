import { eq } from "@narbel/db";
import type { DbExecutor } from "@narbel/db";
import {
  boardDocument,
  boardFile,
  boardVersion,
} from "@narbel/db/schema/drawing";

import type { IDrawingRows } from "../../application/ports/IBoardDocumentStore";

/** The board's foreign keys still cascade these rows today, so a delete here usually finds nothing left. */
export class DrizzleDrawingRows implements IDrawingRows {
  constructor(private readonly db: DbExecutor) {}

  async deleteAll(boardId: string) {
    await this.db
      .delete(boardDocument)
      .where(eq(boardDocument.boardId, boardId));
    await this.db.delete(boardVersion).where(eq(boardVersion.boardId, boardId));
    await this.db.delete(boardFile).where(eq(boardFile.boardId, boardId));
  }
}
