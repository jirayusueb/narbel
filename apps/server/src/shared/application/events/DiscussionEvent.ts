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

interface CommentChangeBase {
  version: 1;
  boardId: string;
  pageId: string;
  /** ISO time of the change; a consumer applies it only over an older one */
  at: string;
}

/** What a comment says now, for readers that mirror comment text (search); no recipients, no excerpt. */
export type CommentChangeEvent =
  | (CommentChangeBase & {
      type: "event.comment-posted" | "event.comment-edited";
      commentId: string;
      body: string;
    })
  | (CommentChangeBase & {
      type: "event.comment-deleted";
      /** the deleted comment and, for a thread root, every reply that went with it */
      commentIds: string[];
    });
