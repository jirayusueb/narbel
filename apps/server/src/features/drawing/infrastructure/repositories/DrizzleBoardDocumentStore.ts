import { and, eq, or, sql } from "@narbel/db";
import type { Database, DbExecutor } from "@narbel/db";
import { boardDocument } from "@narbel/db/schema/drawing";
import { boardText } from "@narbel/db/schema/search";

import type { AfterCommit } from "../../../../shared/infrastructure/uow/DrizzleUnitOfWork";
import { DrizzleUnitOfWork } from "../../../../shared/infrastructure/uow/DrizzleUnitOfWork";
import type { IBoardRecords } from "../../application/ports/IBoardAccess";
import type {
  DocumentCheckpoint,
  IBoardDocumentStore,
  TextChange,
} from "../../application/ports/IBoardDocumentStore";
import { diffTexts, indexTexts } from "../crdt/boardText";
import { checkpointIfDue } from "./boardVersions";

export const writeTexts = async (
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
  private readonly saves: DrizzleUnitOfWork<{
    tx: DbExecutor;
    boards: IBoardRecords;
  }>;

  constructor(
    private readonly db: Database,
    /** boards' record of the board, bound to the save's transaction */
    boardsIn: (tx: DbExecutor, afterCommit: AfterCommit) => IBoardRecords
  ) {
    this.saves = new DrizzleUnitOfWork(this.db, (tx, afterCommit) => ({
      tx,
      boards: boardsIn(tx, afterCommit),
    }));
  }

  async load(boardId: string) {
    const [row] = await this.db
      .select({ state: boardDocument.state })
      .from(boardDocument)
      .where(eq(boardDocument.boardId, boardId))
      .limit(1);
    return row?.state ?? null;
  }

  save(
    boardId: string,
    state: Uint8Array,
    texts?: TextChange,
    checkpoint?: DocumentCheckpoint
  ) {
    return this.saves.run(async ({ tx, boards }) => {
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
      if (checkpoint) {
        await checkpointIfDue(tx, boardId, state, checkpoint.fileIds, now);
      }
      // keeps "newest-updated first" in the board list honest for canvas edits
      await boards.markEdited(boardId, now);
    });
  }
}
