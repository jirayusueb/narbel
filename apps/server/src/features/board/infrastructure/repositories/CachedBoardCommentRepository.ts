import type { ICache } from "../../../../shared/application/interfaces/ICache";
import type { IBoardCommentRepository } from "../../application/ports/IBoardCommentRepository";
import type { Comment } from "../../domain/entities/Comment";

const TTL_SECONDS = 30;

export const commentsKey = (boardId: string, pageId: string | undefined) =>
  `comments:${boardId}:${pageId ?? "all"}`;

type CommentRow = Omit<Comment, "createdAt" | "resolvedAt"> & {
  createdAt: string;
  resolvedAt: string | null;
};

const toRow = (c: Comment): CommentRow => ({
  ...c,
  createdAt: c.createdAt.toISOString(),
  resolvedAt: c.resolvedAt?.toISOString() ?? null,
});

const fromRow = (r: CommentRow): Comment => ({
  ...r,
  createdAt: new Date(r.createdAt),
  resolvedAt: r.resolvedAt ? new Date(r.resolvedAt) : null,
});

export class CachedBoardCommentRepository implements IBoardCommentRepository {
  constructor(
    private readonly inner: IBoardCommentRepository,
    private readonly cache: ICache
  ) {}

  async list(boardId: string, pageId: string | undefined) {
    const key = commentsKey(boardId, pageId);
    const hit = await this.cache.get<CommentRow[]>(key);
    if (hit) {
      return hit.map(fromRow);
    }
    const rows = await this.inner.list(boardId, pageId);
    await this.cache.set(key, rows.map(toRow), TTL_SECONDS);
    return rows;
  }

  // single reads feed writes that must see the latest row
  find(boardId: string, id: string) {
    return this.inner.find(boardId, id);
  }

  async save(comment: Comment) {
    await this.inner.save(comment);
    await this.cache.del(
      commentsKey(comment.boardId, comment.pageId),
      commentsKey(comment.boardId, undefined)
    );
  }

  async delete(boardId: string, id: string) {
    const comment = await this.inner.find(boardId, id);
    await this.inner.delete(boardId, id);
    await this.cache.del(
      commentsKey(boardId, undefined),
      ...(comment ? [commentsKey(boardId, comment.pageId)] : [])
    );
  }
}
