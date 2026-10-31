import type { DiscussionEvent } from "../../../../shared/application/events/DiscussionEvent";
import type { INotificationRepository } from "../../../../shared/application/interfaces/INotifications";
import type { IOutbox } from "../../../../shared/application/interfaces/IOutbox";
import type { IProcessedEvents } from "../../../../shared/application/interfaces/IProcessedEvents";
import type { IProfileReader } from "../../../../shared/application/interfaces/IProfiles";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { reactTo } from "../DiscussionReactions";

export const NOTIFICATION_CONSUMER = "notification";

export interface NotificationTx {
  notifications: INotificationRepository;
  outbox: IOutbox;
  processed: IProcessedEvents;
  people: IProfileReader;
}

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
      await Promise.all([
        ...reaction.notifications
          .filter(({ userId }) => alive.has(userId))
          .map(({ userId, payload: entry }) =>
            tx.notifications.add(userId, entry)
          ),
        ...reaction.emails
          .filter(({ recipientId }) => alive.has(recipientId))
          .map(({ message, dedupeKey }) =>
            tx.outbox.enqueue(message, dedupeKey)
          ),
      ]);
    });
  }
}
