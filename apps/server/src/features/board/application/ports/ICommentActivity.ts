import type { Cursor } from "../../../../shared/kernel/types/Cursor";

/** A comment as get_changes reports it. Discussion owns the full shape; board only reads where it sits. */
export interface ChangedComment {
  id: string;
  x: number;
  y: number;
}

export interface CommentChange {
  /** when the comment last changed in a way get_changes reports */
  activityAt: Date;
  comment: ChangedComment;
}

/** Comment activity on a board after a cursor, oldest first; discussion answers it. */
export interface ICommentActivity {
  since(input: {
    boardId: string;
    after: Cursor;
    limit: number;
    viewerId?: string;
  }): Promise<CommentChange[]>;
}

/** Forgets a removed member as assignee of the board's threads; step 6 turns it into the MemberRemoved event. */
export interface ICommentAssignees {
  clearAssignee(boardId: string, userId: string): Promise<void>;
}
