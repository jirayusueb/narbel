import type { BoardsEvent } from "../../../../shared/application/events/BoardsEvent";
import type { IFileStorage } from "../../../../shared/application/interfaces/IFileStorage";
import type { IProcessedEvents } from "../../../../shared/application/interfaces/IProcessedEvents";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { boardFilePrefix } from "../../domain/values/FileKey";
import type { IDrawingRows } from "../ports/IBoardDocumentStore";
import type { IBoardScenes } from "../ports/IBoardScenes";

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
      await this.storage.deletePrefix(boardFilePrefix(event.boardId));
    });
  }
}
