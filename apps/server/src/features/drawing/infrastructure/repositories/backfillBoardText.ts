import { eq } from "@narbel/db";
import type { Database } from "@narbel/db";
import { boardDocument } from "@narbel/db/schema/drawing";
import * as Y from "yjs";

import { UuidGenerator } from "../../../../shared/infrastructure/ids/UuidGenerator";
import { DrizzleOutbox } from "../../../../shared/infrastructure/outbox/DrizzleOutbox";
import { extractBoardText } from "../crdt/boardText";
import { publishTexts } from "./DrizzleBoardDocumentStore";

const BACKFILL_BATCH = 50;
const ids = new UuidGenerator();

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
      await publishTexts(
        new DrizzleOutbox(tx, ids),
        boardId,
        extractBoardText(doc)
      );
    }
  });

/**
 * Publishes the full text set of documents whose text search has not been told yet. Each board is
 * claimed under a row lock, so a concurrent save either lands first (nothing left to claim) or
 * waits and publishes a later set.
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
    console.log(`Published the text of ${count} board(s) for search`);
  }
};
