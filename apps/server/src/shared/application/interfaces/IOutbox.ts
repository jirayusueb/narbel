/** Every message the outbox can carry. Add a type here and the registry refuses to compile until it handles it. */
export type OutboxMessage =
  | {
      type: "email.board-invite";
      to: string;
      boardId: string;
      boardTitle: string;
      inviterName: string;
    }
  | {
      type: "email.comment-assigned";
      to: string;
      boardId: string;
      commentId: string;
      actorName: string;
      excerpt: string;
    }
  | {
      type: "email.mentioned";
      to: string;
      boardId: string;
      commentId: string;
      actorName: string;
      excerpt: string;
    };

export type OutboxMessageType = OutboxMessage["type"];

/**
 * An integration event a context tells its consumers through the outbox. The producer owns the
 * payload type; the consumer validates what it reads. The worker routes `event.*` to consumers,
 * never to the email registry.
 */
export interface OutboxEvent {
  type: `event.${string}`;
}

export interface IOutbox {
  /** Queues `message` in the caller's transaction; a repeated `dedupeKey` is ignored. */
  enqueue(message: OutboxMessage, dedupeKey: string): Promise<void>;
  /**
   * Queues an integration event in the caller's transaction. Every call is a new event: a second
   * resolve or a later mention is news, so events carry no dedupe key; consumers dedupe what they send.
   */
  publish(event: OutboxEvent): Promise<void>;
  /** Drops the message with `dedupeKey` (pending or sent) so the same key can be queued afresh. */
  forget(dedupeKey: string): Promise<void>;
  /** Drops every undelivered email addressed to `email`. */
  forgetPendingTo(email: string): Promise<void>;
}
