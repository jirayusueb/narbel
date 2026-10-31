import {
  and,
  asc,
  desc,
  eq,
  gt,
  isNotNull,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "@narbel/db";
import type { DbExecutor } from "@narbel/db";
import { comment, commentReaction } from "@narbel/db/schema/discussion";

import type { Cursor } from "../../../../shared/kernel/types/Cursor";
import type {
  CommentActivity,
  CommentView,
  IBoardCommentRepository,
  ReactionSummary,
  ThreadQuery,
} from "../../application/ports/ICommentRepository";
import type { Comment } from "../../domain/entities/Comment";

type Row = typeof comment.$inferSelect;

const toComment = (row: Row): Comment => row;

const before = (cursor: Cursor | null) =>
  cursor
    ? or(
        lt(comment.createdAt, cursor.at),
        and(eq(comment.createdAt, cursor.at), lt(comment.id, cursor.id))
      )
    : undefined;

const after = (cursor: Cursor | null) =>
  cursor
    ? or(
        gt(comment.createdAt, cursor.at),
        and(eq(comment.createdAt, cursor.at), gt(comment.id, cursor.id))
      )
    : undefined;

const statusFilter = (status: ThreadQuery["status"]) => {
  if (status === "all") {
    return;
  }
  return status === "open"
    ? isNull(comment.resolvedAt)
    : isNotNull(comment.resolvedAt);
};

export class DrizzleCommentRepository implements IBoardCommentRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(boardId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(comment)
      .where(and(eq(comment.boardId, boardId), eq(comment.id, id)))
      .limit(1);
    return row ? toComment(row) : null;
  }

  async view(boardId: string, id: string, viewerId?: string) {
    const [row] = await this.db
      .select()
      .from(comment)
      .where(and(eq(comment.boardId, boardId), eq(comment.id, id)))
      .limit(1);
    if (!row) {
      return null;
    }
    const [view] = await this.decorate([row], viewerId);
    return view ?? null;
  }

  async listThreads(query: ThreadQuery) {
    const rows = await this.db
      .select()
      .from(comment)
      .where(
        and(
          eq(comment.boardId, query.boardId),
          isNull(comment.parentId),
          query.pageId === undefined
            ? undefined
            : eq(comment.pageId, query.pageId),
          statusFilter(query.status),
          before(query.after)
        )
      )
      .orderBy(desc(comment.createdAt), desc(comment.id))
      .limit(query.limit);
    return await this.decorate(rows, query.viewerId);
  }

  async listReplies(query: {
    boardId: string;
    threadId: string;
    after: Cursor | null;
    limit: number;
    viewerId?: string;
  }) {
    const rows = await this.db
      .select()
      .from(comment)
      .where(
        and(
          eq(comment.boardId, query.boardId),
          eq(comment.parentId, query.threadId),
          after(query.after)
        )
      )
      .orderBy(asc(comment.createdAt), asc(comment.id))
      .limit(query.limit);
    return await this.decorate(rows, query.viewerId);
  }

  async save(entity: Comment) {
    await this.db.insert(comment).values(entity);
  }

  async update(
    boardId: string,
    id: string,
    patch: Parameters<IBoardCommentRepository["update"]>[2]
  ) {
    await this.db
      .update(comment)
      .set(patch)
      .where(and(eq(comment.boardId, boardId), eq(comment.id, id)));
  }

  async delete(boardId: string, id: string) {
    await this.db
      .delete(comment)
      .where(and(eq(comment.boardId, boardId), eq(comment.id, id)));
  }

  async addReaction(commentId: string, userId: string, emoji: string) {
    await this.db
      .insert(commentReaction)
      .values({ commentId, userId, emoji })
      .onConflictDoNothing();
  }

  async removeReaction(commentId: string, userId: string, emoji: string) {
    await this.db
      .delete(commentReaction)
      .where(
        and(
          eq(commentReaction.commentId, commentId),
          eq(commentReaction.userId, userId),
          eq(commentReaction.emoji, emoji)
        )
      );
  }

  async clearAssignee(boardId: string, userId: string) {
    await this.db
      .update(comment)
      .set({ assigneeId: null })
      .where(and(eq(comment.boardId, boardId), eq(comment.assigneeId, userId)));
  }

  async listActivity(query: {
    boardId: string;
    after: Cursor;
    limit: number;
    viewerId?: string;
  }): Promise<CommentActivity[]> {
    // greatest() ignores NULLs, so an unedited, unresolved row reports its creation time
    const activity = sql<Date>`greatest(${comment.createdAt}, ${comment.editedAt}, ${comment.resolvedAt})`;
    const at = query.after.at.toISOString();
    const rows = await this.db
      .select({ row: comment, activityAt: activity.mapWith(comment.createdAt) })
      .from(comment)
      .where(
        and(
          eq(comment.boardId, query.boardId),
          sql`(${activity} > ${at} or (${activity} = ${at} and ${comment.id} > ${query.after.id}))`
        )
      )
      .orderBy(asc(activity), asc(comment.id))
      .limit(query.limit);
    const views = await this.decorate(
      rows.map(({ row }) => row),
      query.viewerId
    );
    return views.map((view, index) => ({
      ...view,
      activityAt: rows[index]?.activityAt ?? view.comment.createdAt,
    }));
  }

  /** Adds reply counts and reaction tallies for a whole page of rows in two queries. */
  private async decorate(
    rows: Row[],
    viewerId?: string
  ): Promise<CommentView[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.id);
    const [replyCounts, reactionRows] = await Promise.all([
      this.db
        .select({
          parentId: comment.parentId,
          value: sql<number>`count(*)::int`,
        })
        .from(comment)
        .where(inArray(comment.parentId, ids))
        .groupBy(comment.parentId),
      this.db
        .select({
          commentId: commentReaction.commentId,
          emoji: commentReaction.emoji,
          count: sql<number>`count(*)::int`,
          mine: sql<boolean>`coalesce(bool_or(${commentReaction.userId} = ${viewerId ?? null}), false)`,
        })
        .from(commentReaction)
        .where(inArray(commentReaction.commentId, ids))
        .groupBy(commentReaction.commentId, commentReaction.emoji)
        .orderBy(sql`min(${commentReaction.createdAt})`),
    ]);
    const replies = new Map(replyCounts.map((r) => [r.parentId, r.value]));
    const reactions = new Map<string, ReactionSummary[]>();
    for (const { commentId, ...summary } of reactionRows) {
      reactions.set(commentId, [...(reactions.get(commentId) ?? []), summary]);
    }
    return rows.map((row) => ({
      comment: toComment(row),
      replyCount: replies.get(row.id) ?? 0,
      reactions: reactions.get(row.id) ?? [],
    }));
  }
}
