import type { IdentityEvent } from "../../../../shared/application/events/IdentityEvent";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { NOTIFICATION_CONSUMER } from "./HandleDiscussionEvent";
import type { NotificationTx } from "./HandleDiscussionEvent";

/** A deleted person's undelivered emails are dropped so nothing mails a closed account; once per event. */
export class ForgetDeletedPerson {
  constructor(private readonly uow: IUnitOfWork<NotificationTx>) {}

  async execute(eventId: string, event: IdentityEvent): Promise<void> {
    await this.uow.run(async (tx) => {
      if (await tx.processed.claim(NOTIFICATION_CONSUMER, eventId)) {
        await tx.outbox.forgetPendingTo(event.email);
      }
    });
  }
}
