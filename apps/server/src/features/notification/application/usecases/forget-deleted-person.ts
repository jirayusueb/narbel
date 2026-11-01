import type { IdentityEvent } from "../../../../shared/application/events/identity-event";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/i-unit-of-work";
import { NOTIFICATION_CONSUMER } from "../notification-consumer";
import type { NotificationTx } from "../notification-consumer";

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
