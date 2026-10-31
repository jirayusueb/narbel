import { eq } from "@narbel/db";
import type { Database, DbExecutor } from "@narbel/db";
import { boardDocument } from "@narbel/db/schema/drawing";

import type { DrawingEvent } from "../../../../shared/application/events/DrawingEvent";
import type { IOutbox } from "../../../../shared/application/interfaces/IOutbox";
import { UuidGenerator } from "../../../../shared/infrastructure/ids/UuidGenerator";
import { DrizzleOutbox } from "../../../../shared/infrastructure/outbox/DrizzleOutbox";
import type { AfterCommit } from "../../../../shared/infrastructure/uow/DrizzleUnitOfWork";
import { DrizzleUnitOfWork } from "../../../../shared/infrastructure/uow/DrizzleUnitOfWork";
import type { IBoardRecords } from "../../application/ports/IBoardAccess";
import type {
  BoardText,
  DocumentCheckpoint,
  IBoardDocumentStore,
} from "../../application/ports/IBoardDocumentStore";
import { checkpointIfDue } from "./boardVersions";

/**
 * Tells search the board's full text set. Called after the document row is written: its row lock
 * orders saves of one board, so a later save always carries a later `savedAt`.
 */
export const publishTexts = (
  outbox: IOutbox,
  boardId: string,
  texts: BoardText[]
) => {
  const event: DrawingEvent = {
    type: "event.drawing-text-changed",
    version: 1,
    boardId,
    savedAt: new Date().toISOString(),
    texts,
  };
  return outbox.publish(event);
};

export class DrizzleBoardDocumentStore implements IBoardDocumentStore {
  private readonly saves: DrizzleUnitOfWork<{
    tx: DbExecutor;
    boards: IBoardRecords;
    outbox: IOutbox;
  }>;

  constructor(
    private readonly db: Database,
    /** boards' record of the board, bound to the save's transaction */
    boardsIn: (tx: DbExecutor, afterCommit: AfterCommit) => IBoardRecords,
    /** asks the outbox worker for a pass now; a save wakes it after it commits */
    wakeOutbox: () => void
  ) {
    const ids = new UuidGenerator();
    this.saves = new DrizzleUnitOfWork(this.db, (tx, afterCommit) => {
      afterCommit(wakeOutbox);
      return {
        tx,
        boards: boardsIn(tx, afterCommit),
        outbox: new DrizzleOutbox(tx, ids),
      };
    });
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
    texts?: BoardText[],
    checkpoint?: DocumentCheckpoint
  ) {
    return this.saves.run(async ({ tx, boards, outbox }) => {
      const now = new Date();
      await tx
        .insert(boardDocument)
        .values({ boardId, state, updatedAt: now, textIndexed: true })
        .onConflictDoUpdate({
          target: boardDocument.boardId,
          set: { state, updatedAt: now, textIndexed: true },
        });
      if (texts) {
        await publishTexts(outbox, boardId, texts);
      }
      if (checkpoint) {
        await checkpointIfDue(tx, boardId, state, checkpoint.fileIds, now);
      }
      // keeps "newest-updated first" in the board list honest for canvas edits
      await boards.markEdited(boardId, now);
    });
  }
}
