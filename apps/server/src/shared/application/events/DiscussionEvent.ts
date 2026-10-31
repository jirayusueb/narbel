/**
 * The integration events discussion publishes through the outbox: its published language. The
 * producer builds them, consumers read them; neither imports the other.
 */
export interface EventActor {
  userId: string;
  username: string | null;
  name: string;
}

export interface EventRecipient {
  id: string;
  email: string;
}

interface ThreadEventBase {
  /** a payload change that removes or renames a field needs a new version */
  version: 1;
  boardId: string;
  commentId: string;
  threadId: string;
  actor: EventActor;
}

export type DiscussionEvent =
  | (ThreadEventBase & {
      type: "event.comment-assigned";
      excerpt: string;
      recipient: EventRecipient;
    })
  | (ThreadEventBase & {
      type: "event.people-mentioned";
      excerpt: string;
      recipients: EventRecipient[];
    })
  | (ThreadEventBase & {
      type: "event.thread-replied";
      excerpt: string;
      recipientIds: string[];
    })
  | (ThreadEventBase & {
      type: "event.thread-resolved";
      recipientIds: string[];
    });
