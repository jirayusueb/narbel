import type { Cursor } from "../../../../shared/kernel/types/Cursor";
import type { Comment } from "../../domain/entities/Comment";
import type {
  CommentView,
  IBoardCommentRepository,
  ReactionSummary,
  ThreadQuery,
} from "../ports/ICommentRepository";

/** In-memory comments with the repository's contract: newest threads first, oldest activity first. */
export class FakeComments implements IBoardCommentRepository {
  readonly rows = new Map<string, Comment>();
  readonly reactions: { commentId: string; userId: string; emoji: string }[] =
    [];
  findById = (boardId: string, id: string) => {
    const row = this.rows.get(id);
    return Promise.resolve(row?.boardId === boardId ? row : null);
  };
  private viewOf(comment: Comment, viewerId?: string): CommentView {
    const tally = new Map<string, ReactionSummary>();
    for (const r of this.reactions.filter((x) => x.commentId === comment.id)) {
      const entry = tally.get(r.emoji) ?? {
        emoji: r.emoji,
        count: 0,
        mine: false,
      };
      tally.set(r.emoji, {
        ...entry,
        count: entry.count + 1,
        mine: entry.mine || r.userId === viewerId,
      });
    }
    return {
      comment,
      replyCount: [...this.rows.values()].filter(
        (c) => c.parentId === comment.id
      ).length,
      reactions: [...tally.values()],
    };
  }
  view = async (boardId: string, id: string, viewerId?: string) => {
    const comment = await this.findById(boardId, id);
    return comment ? this.viewOf(comment, viewerId) : null;
  };
  listThreads = (q: ThreadQuery) =>
    Promise.resolve(
      [...this.rows.values()]
        .filter(
          (c) =>
            c.boardId === q.boardId &&
            c.parentId === null &&
            (q.pageId === undefined || c.pageId === q.pageId) &&
            (q.status === "all" ||
              (q.status === "open") === (c.resolvedAt === null))
        )
        .toSorted(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() ||
            b.id.localeCompare(a.id)
        )
        .filter(
          (c) =>
            !q.after ||
            c.createdAt.getTime() < q.after.at.getTime() ||
            (c.createdAt.getTime() === q.after.at.getTime() &&
              c.id < q.after.id)
        )
        .slice(0, q.limit)
        .map((c) => this.viewOf(c, q.viewerId))
    );
  listReplies = (q: {
    boardId: string;
    threadId: string;
    after: Cursor | null;
    limit: number;
    viewerId?: string;
  }) =>
    Promise.resolve(
      [...this.rows.values()]
        .filter((c) => c.boardId === q.boardId && c.parentId === q.threadId)
        .toSorted(
          (a, b) =>
            a.createdAt.getTime() - b.createdAt.getTime() ||
            a.id.localeCompare(b.id)
        )
        .filter(
          (c) =>
            !q.after ||
            c.createdAt.getTime() > q.after.at.getTime() ||
            (c.createdAt.getTime() === q.after.at.getTime() &&
              c.id > q.after.id)
        )
        .slice(0, q.limit)
        .map((c) => this.viewOf(c, q.viewerId))
    );
  save = (comment: Comment) => {
    this.rows.set(comment.id, comment);
    return Promise.resolve();
  };
  update = (
    boardId: string,
    id: string,
    patch: Parameters<IBoardCommentRepository["update"]>[2]
  ) => {
    const row = this.rows.get(id);
    if (row?.boardId === boardId) {
      this.rows.set(id, { ...row, ...patch });
    }
    return Promise.resolve();
  };
  private remove(gone: (c: Comment) => boolean) {
    const removed = [...this.rows.values()].filter(gone);
    for (const c of removed) {
      this.rows.delete(c.id);
    }
    return Promise.resolve(removed);
  }
  delete = async (boardId: string, id: string) =>
    (
      await this.remove(
        (c) => c.boardId === boardId && (c.id === id || c.parentId === id)
      )
    ).map((c) => c.id);
  deleteByAuthor = (authorId: string) => {
    const roots = new Set(
      [...this.rows.values()]
        .filter((c) => c.authorId === authorId)
        .map((c) => c.id)
    );
    return this.remove(
      (c) => c.authorId === authorId || roots.has(c.parentId ?? "")
    );
  };
  addReaction = (commentId: string, userId: string, emoji: string) => {
    if (
      !this.reactions.some(
        (r) =>
          r.commentId === commentId && r.userId === userId && r.emoji === emoji
      )
    ) {
      this.reactions.push({ commentId, userId, emoji });
    }
    return Promise.resolve();
  };
  removeReaction = (commentId: string, userId: string, emoji: string) => {
    const index = this.reactions.findIndex(
      (r) =>
        r.commentId === commentId && r.userId === userId && r.emoji === emoji
    );
    if (index !== -1) {
      this.reactions.splice(index, 1);
    }
    return Promise.resolve();
  };
  clearAssignee = (boardId: string, userId: string) => {
    for (const [id, c] of this.rows) {
      if (c.boardId === boardId && c.assigneeId === userId) {
        this.rows.set(id, { ...c, assigneeId: null });
      }
    }
    return Promise.resolve();
  };
  listActivity = (q: {
    boardId: string;
    after: Cursor;
    limit: number;
    viewerId?: string;
  }) => {
    const activityAt = (c: Comment) =>
      new Date(
        Math.max(
          c.createdAt.getTime(),
          c.editedAt?.getTime() ?? 0,
          c.resolvedAt?.getTime() ?? 0
        )
      );
    return Promise.resolve(
      [...this.rows.values()]
        .filter((c) => c.boardId === q.boardId)
        .map((c) => ({
          ...this.viewOf(c, q.viewerId),
          activityAt: activityAt(c),
        }))
        .filter(
          (v) =>
            v.activityAt.getTime() > q.after.at.getTime() ||
            (v.activityAt.getTime() === q.after.at.getTime() &&
              v.comment.id > q.after.id)
        )
        .toSorted(
          (a, b) =>
            a.activityAt.getTime() - b.activityAt.getTime() ||
            a.comment.id.localeCompare(b.comment.id)
        )
        .slice(0, q.limit)
    );
  };
}
