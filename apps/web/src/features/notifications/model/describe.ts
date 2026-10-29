export interface ActorRef {
  userId: string;
  username: string | null;
  name: string;
}

export type NotificationPayload =
  | {
      kind: "comment.reply" | "comment.assigned" | "comment.mentioned";
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

const VERB: Record<NotificationPayload["kind"], string> = {
  "comment.reply": "replied to a thread you are in",
  "comment.assigned": "assigned a comment to you",
  "comment.mentioned": "mentioned you",
  "comment.resolved": "resolved a comment",
  "board.invited": "invited you to a board",
};

const detail = (payload: NotificationPayload) => {
  if ("boardTitle" in payload) {
    return payload.boardTitle;
  }
  return "excerpt" in payload ? payload.excerpt : null;
};

export const describe = (payload: NotificationPayload) => ({
  verb: VERB[payload.kind],
  detail: detail(payload),
});

// Where a click should land: the board, with the thread to focus when the event has one.
export const target = (payload: NotificationPayload) => ({
  boardId: payload.boardId,
  comment: "threadId" in payload ? payload.threadId : undefined,
});
