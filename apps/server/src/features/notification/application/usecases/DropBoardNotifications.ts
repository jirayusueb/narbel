import type { BoardsEvent } from "../../../../shared/application/events/BoardsEvent";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { NOTIFICATION_CONSUMER } from "./HandleDiscussionEvent";
import type { NotificationTx } from "./HandleDiscussionEvent";

/** A deleted board's notifications go with it for every user, or they would open a dead page; once per event. */
export class DropBoardNotifications {
  constructor(private readonly uow: IUnitOfWork<NotificationTx>) {}

  async execute(
    eventId: string,
    event: Extract<BoardsEvent, { type: "event.board-deleted" }>
  ): Promise<void> {
    await this.uow.run(async (tx) => {
      if (await tx.processed.claim(NOTIFICATION_CONSUMER, eventId)) {
        await tx.notifications.deleteForBoard(event.boardId);
      }
    });
  }
}
