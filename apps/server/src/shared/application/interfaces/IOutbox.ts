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

export interface IOutbox {
  /** Queues `message` in the caller's transaction; a repeated `dedupeKey` is ignored. */
  enqueue(message: OutboxMessage, dedupeKey: string): Promise<void>;
  /** Drops the message with `dedupeKey` (pending or sent) so the same key can be queued afresh. */
  forget(dedupeKey: string): Promise<void>;
}
