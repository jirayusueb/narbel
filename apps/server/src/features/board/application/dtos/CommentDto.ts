import type { Comment } from "../../domain/entities/Comment";

export interface CommentDto {
  id: string;
  boardId: string;
  pageId: string;
  x: number;
  y: number;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  resolvedAt: string | null;
  parentId: string | null;
}

export const toCommentDto = (comment: Comment): CommentDto => ({
  ...comment,
  createdAt: comment.createdAt.toISOString(),
  resolvedAt: comment.resolvedAt?.toISOString() ?? null,
});
