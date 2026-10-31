import { and, desc, eq } from "@narbel/db";
import type { Database } from "@narbel/db";
import { boardVersion } from "@narbel/db/schema/board";

import type {
  IBoardVersions,
  NewVersion,
} from "../../application/ports/IBoardVersions";
import { insertVersion } from "./boardVersions";

export class DrizzleBoardVersionRepository implements IBoardVersions {
  constructor(private readonly db: Database) {}

  list(boardId: string) {
    return this.db
      .select({
        id: boardVersion.id,
        kind: boardVersion.kind,
        createdAt: boardVersion.createdAt,
        createdById: boardVersion.createdById,
      })
      .from(boardVersion)
      .where(eq(boardVersion.boardId, boardId))
      .orderBy(desc(boardVersion.createdAt));
  }

  async findInBoard(boardId: string, id: string) {
    const [row] = await this.db
      .select({
        id: boardVersion.id,
        kind: boardVersion.kind,
        createdAt: boardVersion.createdAt,
        createdById: boardVersion.createdById,
        state: boardVersion.state,
      })
      .from(boardVersion)
      .where(and(eq(boardVersion.boardId, boardId), eq(boardVersion.id, id)))
      .limit(1);
    return row ?? null;
  }

  record(boardId: string, version: NewVersion) {
    return this.db.transaction((tx) => insertVersion(tx, boardId, version));
  }
}
