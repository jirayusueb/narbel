import { and, eq, or, sql } from "@narbel/db";
import type { Database, DbExecutor } from "@narbel/db";
import { board, boardDocument, boardText } from "@narbel/db/schema/board";
import * as Y from "yjs";

import type {
  IBoardDocumentStore,
  TextChange,
} from "../../application/ports/IBoardDocumentStore";
import {
  diffTexts,
  extractBoardText,
  indexTexts,
  replaceAllTexts,
} from "../crdt/boardText";

const BACKFILL_BATCH = 50;

const writeTexts = async (
  db: DbExecutor,
  boardId: string,
  change: TextChange
): Promise<void> => {
  if (change.replaceAll) {
    // A full set (first save after a load, backfill) is diffed against the stored rows, so an
    // unchanged board writes nothing. The document upsert above already holds this board's row lock.
    const stored = await db
      .select({
        pageId: boardText.pageId,
        elementId: boardText.elementId,
        text: boardText.text,
      })
      .from(boardText)
      .where(eq(boardText.boardId, boardId));
    const diff = diffTexts(indexTexts(stored), indexTexts(change.upsert));
    if (diff) {
      await writeTexts(db, boardId, diff);
    }
    return;
  }
  const { upsert, remove } = change;
  if (remove.length > 0) {
    await db
      .delete(boardText)
      .where(
        and(
          eq(boardText.boardId, boardId),
          or(
            ...remove.map((key) =>
              and(
                eq(boardText.pageId, key.pageId),
                eq(boardText.elementId, key.elementId)
              )
            )
          )
        )
      );
  }
  if (upsert.length > 0) {
    await db
      .insert(boardText)
      .values(upsert.map((text) => ({ boardId, ...text })))
      .onConflictDoUpdate({
        target: [boardText.boardId, boardText.pageId, boardText.elementId],
        set: { text: sql`excluded.text` },
      });
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

  save(boardId: string, state: Uint8Array, texts?: TextChange) {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      await tx
        .insert(boardDocument)
        .values({ boardId, state, updatedAt: now, textIndexed: true })
        .onConflictDoUpdate({
          target: boardDocument.boardId,
          set: { state, updatedAt: now, textIndexed: true },
        });
      if (texts) {
        await writeTexts(tx, boardId, texts);
      }
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
        await writeTexts(tx, boardId, replaceAllTexts(extractBoardText(doc)));
      }
    });
  }
}
