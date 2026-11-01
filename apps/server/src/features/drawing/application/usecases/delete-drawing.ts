import type { BoardsEvent } from "../../../../shared/application/events/boards-event";
import type { IFileStorage } from "../../../../shared/application/interfaces/i-file-storage";
import type { IProcessedEvents } from "../../../../shared/application/interfaces/i-processed-events";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/i-unit-of-work";
import { FileKey } from "../../domain/values/file-key";
import type { IDrawingRows } from "../ports/i-board-document-store";
import type { IBoardScenes } from "../ports/i-board-scenes";

export const DRAWING_CONSUMER = "drawing";

export interface DeleteDrawingTx {
  drawings: IDrawingRows;
  processed: IProcessedEvents;
}

/** A deleted board takes its drawing with it: the stored rows, the live room and the image bytes. */
export class DeleteDrawing {
  constructor(
    private readonly uow: IUnitOfWork<DeleteDrawingTx>,
    private readonly scenes: Pick<IBoardScenes, "discard">,
    private readonly storage: IFileStorage
  ) {}

  async execute(
    eventId: string,
    event: Extract<BoardsEvent, { type: "event.board-deleted" }>
  ): Promise<void> {
    await this.uow.run(async (tx) => {
      if (!(await tx.processed.claim(DRAWING_CONSUMER, eventId))) {
        return;
      }
      await tx.drawings.deleteAll(event.boardId);
      await this.scenes.discard(event.boardId);
      // inside the transaction: a failed delete leaves the event unmarked, so the worker retries it
      await this.storage.deletePrefix(FileKey.prefix(event.boardId));
    });
  }
}
