import { eq } from "@narbel/db";
import type { Database } from "@narbel/db";
import { boardDocument } from "@narbel/db/schema/drawing";
import * as Y from "yjs";

import { extractBoardText, replaceAllTexts } from "../crdt/boardText";
import { writeTexts } from "./DrizzleBoardDocumentStore";

const BACKFILL_BATCH = 50;

const indexOne = (db: Database, boardId: string) =>
  db.transaction(async (tx) => {
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

/**
 * Mirrors the text of documents saved before search existed. Each board is claimed under a
 * row lock, so a concurrent save either lands first (nothing left to claim) or waits and overwrites.
 */
export const backfillTexts = async (
  db: Database,
  done = 0
): Promise<number> => {
  const pending = await db
    .select({ boardId: boardDocument.boardId })
    .from(boardDocument)
    .where(eq(boardDocument.textIndexed, false))
    .limit(BACKFILL_BATCH);
  await Promise.all(pending.map(({ boardId }) => indexOne(db, boardId)));
  const total = done + pending.length;
  return pending.length < BACKFILL_BATCH ? total : backfillTexts(db, total);
};

/** Startup step: makes boards saved before search existed searchable. Idempotent. */
export const backfillBoardText = async (db: Database) => {
  const count = await backfillTexts(db);
  if (count > 0) {
    console.log(`Indexed text of ${count} board(s) for search`);
  }
};
