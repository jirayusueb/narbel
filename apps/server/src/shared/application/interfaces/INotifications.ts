export interface ActorRef {
  userId: string;
  username: string | null;
  name: string;
}

export type NotificationPayload =
  | {
      kind: "comment.reply";
      boardId: string;
      commentId: string;
      threadId: string;
      actor: ActorRef;
      excerpt: string;
    }
  | {
      kind: "comment.assigned";
      boardId: string;
      commentId: string;
      threadId: string;
      actor: ActorRef;
      excerpt: string;
    }
  | {
      kind: "comment.mentioned";
      boardId: string;
      commentId: string;
      threadId: string;
      actor: ActorRef;
      excerpt: string;
    }
  | {
      kind: "comment.resolved";
      boardId: string;
      commentId: string;
      threadId: string;
      actor: ActorRef;
    }
  | {
      kind: "board.invited";
      boardId: string;
      boardTitle: string;
      actor: ActorRef;
    };

export type NotificationDto = {
  id: string;
  createdAt: string;
  readAt: string | null;
} & NotificationPayload;

export interface NotificationPage {
  items: NotificationDto[];
  nextCursor: string | null;
  unreadCount: number;
}

export interface INotificationRepository {
  /** Stores the notification; subscribers hear about it only after the surrounding transaction commits. */
  add(userId: string, payload: NotificationPayload): Promise<void>;
  deleteForBoard(boardId: string): Promise<void>;
  /** Only notifications of boards in `readableBoardIds` are listed; the set comes from the boards context. */
  list(
    userId: string,
    page: { cursor: string | null; limit: number },
    readableBoardIds: string[]
  ): Promise<NotificationPage>;
  /** Marks `ids` (all when omitted) read and returns the new unread count, counting only readable boards. */
  markRead(
    userId: string,
    ids: string[] | undefined,
    readableBoardIds: string[]
  ): Promise<number>;
}

/** Channel the realtime stream of one user listens on. */
export const notificationChannel = (userId: string) => `notify:${userId}`;
