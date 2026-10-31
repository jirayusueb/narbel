import type { DiscussionEvent } from "../../../shared/application/events/DiscussionEvent";
import type { NotificationPayload } from "../../../shared/application/interfaces/INotifications";
import type { OutboxMessage } from "../../../shared/application/interfaces/IOutbox";

export interface Reaction {
  notifications: { userId: string; payload: NotificationPayload }[];
  emails: { recipientId: string; message: OutboxMessage; dedupeKey: string }[];
}

/** What one discussion event becomes in the inbox and the mail queue; dedupe keys match the pre-event ones. */
export const reactTo = (event: DiscussionEvent): Reaction => {
  const { boardId, commentId, threadId, actor: who } = event;
  const ref = { boardId, commentId, threadId, actor: who };
  switch (event.type) {
    case "event.comment-assigned": {
      return {
        notifications: [
          {
            userId: event.recipient.id,
            payload: {
              kind: "comment.assigned",
              ...ref,
              excerpt: event.excerpt,
            },
          },
        ],
        emails: [
          {
            recipientId: event.recipient.id,
            message: {
              type: "email.comment-assigned",
              to: event.recipient.email,
              boardId,
              commentId,
              actorName: who.name,
              excerpt: event.excerpt,
            },
            dedupeKey: `assigned:${commentId}:${event.recipient.id}`,
          },
        ],
      };
    }
    case "event.people-mentioned": {
      return {
        notifications: event.recipients.map((person) => ({
          userId: person.id,
          payload: {
            kind: "comment.mentioned",
            ...ref,
            excerpt: event.excerpt,
          },
        })),
        emails: event.recipients.map((person) => ({
          recipientId: person.id,
          message: {
            type: "email.mentioned",
            to: person.email,
            boardId,
            commentId,
            actorName: who.name,
            excerpt: event.excerpt,
          },
          dedupeKey: `mentioned:${commentId}:${person.id}`,
        })),
      };
    }
    case "event.thread-replied": {
      return {
        notifications: event.recipientIds.map((userId) => ({
          userId,
          payload: { kind: "comment.reply", ...ref, excerpt: event.excerpt },
        })),
        emails: [],
      };
    }
    case "event.thread-resolved": {
      return {
        notifications: event.recipientIds.map((userId) => ({
          userId,
          payload: { kind: "comment.resolved", ...ref },
        })),
        emails: [],
      };
    }
    default: {
      return { notifications: [], emails: [] };
    }
  }
};
