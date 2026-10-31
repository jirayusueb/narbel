import type { BoardsEvent } from "../../../../shared/application/events/BoardsEvent";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { NOTIFICATION_CONSUMER } from "./HandleDiscussionEvent";
import type { NotificationTx } from "./HandleDiscussionEvent";

/** Forgets a removed member's invite email so a later invite to the same address is sent afresh; once per event. */
export class ForgetRemovedInvite {
  constructor(private readonly uow: IUnitOfWork<NotificationTx>) {}

  async execute(
    eventId: string,
    event: Extract<BoardsEvent, { type: "event.member-removed" }>
  ): Promise<void> {
    await this.uow.run(async (tx) => {
      if (await tx.processed.claim(NOTIFICATION_CONSUMER, eventId)) {
        await tx.outbox.forget(`invite:${event.boardId}:${event.email}`);
      }
    });
  }
}
