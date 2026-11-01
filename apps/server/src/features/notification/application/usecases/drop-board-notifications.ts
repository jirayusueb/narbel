import type { BoardsEvent } from "../../../../shared/application/events/boards-event";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/i-unit-of-work";
import { NOTIFICATION_CONSUMER } from "../notification-consumer";
import type { NotificationTx } from "../notification-consumer";

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
