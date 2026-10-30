import { eq } from "@narbel/db";
import type { Database, DbExecutor } from "@narbel/db";
import { board, boardDocument, boardText } from "@narbel/db/schema/board";
import * as Y from "yjs";

import { extractBoardText } from "../crdt/boardText";
import type { BoardText } from "../crdt/boardText";

export interface IBoardDocumentStore {
  load(boardId: string): Promise<Uint8Array | null>;
  /**
   * Persists the state together with the search mirror of its text.
   * Resolves to the owner of the board (for cache invalidation), or undefined if the board is gone.
   */
  save(
    boardId: string,
    state: Uint8Array,
    texts: BoardText[]
  ): Promise<string | undefined>;
}

const BACKFILL_BATCH = 50;

const replaceTexts = async (
  db: DbExecutor,
  boardId: string,
  texts: BoardText[]
) => {
  await db.delete(boardText).where(eq(boardText.boardId, boardId));
  if (texts.length > 0) {
    await db
      .insert(boardText)
      .values(texts.map((text) => ({ boardId, ...text })));
  }
};

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

  save(boardId: string, state: Uint8Array, texts: BoardText[]) {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      await tx
        .insert(boardDocument)
        .values({ boardId, state, updatedAt: now, textIndexed: true })
        .onConflictDoUpdate({
          target: boardDocument.boardId,
          set: { state, updatedAt: now, textIndexed: true },
        });
      await replaceTexts(tx, boardId, texts);
      // keeps "newest-updated first" in the board list honest for canvas edits
      const [row] = await tx
        .update(board)
        .set({ updatedAt: now })
        .where(eq(board.id, boardId))
        .returning({ ownerId: board.ownerId });
      return row?.ownerId;
    });
  }

  /**
   * Mirrors the text of documents saved before search existed. Each board is claimed under a
   * row lock, so a concurrent save either lands first (nothing left to claim) or waits and overwrites.
   */
  async backfillTexts(done = 0): Promise<number> {
    const pending = await this.db
      .select({ boardId: boardDocument.boardId })
      .from(boardDocument)
      .where(eq(boardDocument.textIndexed, false))
      .limit(BACKFILL_BATCH);
    await Promise.all(pending.map(({ boardId }) => this.indexOne(boardId)));
    const total = done + pending.length;
    return pending.length < BACKFILL_BATCH ? total : this.backfillTexts(total);
  }

  private indexOne(boardId: string) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(boardDocument)
        .set({ textIndexed: true })
        .where(eq(boardDocument.boardId, boardId))
        .returning({ state: boardDocument.state });
      if (row) {
        const doc = new Y.Doc();
        Y.applyUpdate(doc, row.state);
        await replaceTexts(tx, boardId, extractBoardText(doc));
      }
    });
  }
}
