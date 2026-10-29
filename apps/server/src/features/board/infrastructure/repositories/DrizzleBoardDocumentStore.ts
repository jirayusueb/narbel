import { eq } from "@narbel/db";
import type { Database } from "@narbel/db";
import { board, boardDocument } from "@narbel/db/schema/board";

export interface IBoardDocumentStore {
  load(boardId: string): Promise<Uint8Array | null>;
  /** Resolves to the owner of the board (for cache invalidation), or undefined if the board is gone. */
  save(boardId: string, state: Uint8Array): Promise<string | undefined>;
}

export class DrizzleBoardDocumentStore implements IBoardDocumentStore {
  constructor(private readonly db: Database) {}

  async load(boardId: string) {
    const [row] = await this.db
      .select({ state: boardDocument.state })
      .from(boardDocument)
      .where(eq(boardDocument.boardId, boardId))
      .limit(1);
    return row?.state ?? null;
  }

  async save(boardId: string, state: Uint8Array) {
    const now = new Date();
    await this.db
      .insert(boardDocument)
      .values({ boardId, state, updatedAt: now })
      .onConflictDoUpdate({
        target: boardDocument.boardId,
        set: { state, updatedAt: now },
      });
    // keeps "newest-updated first" in the board list honest for canvas edits
    const [row] = await this.db
      .update(board)
      .set({ updatedAt: now })
      .where(eq(board.id, boardId))
      .returning({ ownerId: board.ownerId });
    return row?.ownerId;
  }
}
