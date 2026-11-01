import type { DiscussionEvent } from "../../../../shared/application/events/discussion-event";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/i-unit-of-work";
import { inSequence } from "../../../../shared/kernel/in-sequence";
import { reactTo } from "../discussion-reactions";
import { NOTIFICATION_CONSUMER } from "../notification-consumer";
import type { NotificationTx } from "../notification-consumer";

/**
 * Turns a discussion event into inbox entries and queued emails, once per event id. The
 * notifications, the emails and the processed mark commit together or not at all.
 */
export class HandleDiscussionEvent {
  constructor(private readonly uow: IUnitOfWork<NotificationTx>) {}

  async execute(eventId: string, event: DiscussionEvent): Promise<void> {
    const reaction = reactTo(event);
    await this.uow.run(async (tx) => {
      if (!(await tx.processed.claim(NOTIFICATION_CONSUMER, eventId))) {
        return;
      }
      // a recipient deleted between the comment and now is skipped, not a reason to fail the others
      const ids = [
        ...new Set([
          ...reaction.notifications.map((n) => n.userId),
          ...reaction.emails.map((e) => e.recipientId),
        ]),
      ];
      const people = await tx.people.findPeople(ids);
      const alive = new Set(people.map((person) => person.id));
      await inSequence(
        reaction.notifications.filter(({ userId }) => alive.has(userId)),
        ({ userId, payload: entry }) => tx.notifications.add(userId, entry)
      );
      await inSequence(
        reaction.emails.filter(({ recipientId }) => alive.has(recipientId)),
        ({ message, dedupeKey }) => tx.outbox.enqueue(message, dedupeKey)
      );
    });
  }
}
