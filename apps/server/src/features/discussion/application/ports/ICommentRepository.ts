import type { Cursor } from "../../../../shared/kernel/types/Cursor";
import type { Comment } from "../../domain/entities/Comment";

export interface ReactionSummary {
  emoji: string;
  count: number;
  mine: boolean;
}

/** A comment with what lists show next to it. */
export interface CommentView {
  comment: Comment;
  replyCount: number;
  reactions: ReactionSummary[];
}

export interface CommentActivity extends CommentView {
  /** greatest(createdAt, editedAt, resolvedAt): when this row last changed in a way get_changes reports */
  activityAt: Date;
}

export type ThreadStatus = "open" | "resolved" | "all";

export interface ThreadQuery {
  boardId: string;
  /** omitted = every page of the board */
  pageId?: string;
  status: ThreadStatus;
  /** rows strictly after this position, newest first */
  after: Cursor | null;
  limit: number;
  /** whose reactions count as `mine` */
  viewerId?: string;
}

export interface IBoardCommentRepository {
  findById(boardId: string, id: string): Promise<Comment | null>;
  view(
    boardId: string,
    id: string,
    viewerId?: string
  ): Promise<CommentView | null>;
  /** Thread roots, newest first. */
  listThreads(query: ThreadQuery): Promise<CommentView[]>;
  /** Replies of one thread, oldest first, strictly after the cursor. */
  listReplies(query: {
    boardId: string;
    threadId: string;
    after: Cursor | null;
    limit: number;
    viewerId?: string;
  }): Promise<CommentView[]>;
  /** Inserts a new comment. */
  save(comment: Comment): Promise<void>;
  /** Writes only the given columns, so concurrent edits of other columns survive. */
  update(
    boardId: string,
    id: string,
    patch: Partial<
      Pick<
        Comment,
        "body" | "editedAt" | "resolvedAt" | "resolvedById" | "assigneeId"
      >
    >
  ): Promise<void>;
  delete(boardId: string, id: string): Promise<void>;
  addReaction(commentId: string, userId: string, emoji: string): Promise<void>;
  removeReaction(
    commentId: string,
    userId: string,
    emoji: string
  ): Promise<void>;
  /** Unassigns every comment of the board that was assigned to `userId`. */
  clearAssignee(boardId: string, userId: string): Promise<void>;
  /**
   * Threads and replies created, edited or resolved strictly after `after`, by (activityAt, id)
   * ascending. Reopens, deletes and reactions leave no timestamp, so they are not reported.
   */
  listActivity(query: {
    boardId: string;
    after: Cursor;
    limit: number;
    viewerId?: string;
  }): Promise<CommentActivity[]>;
}
