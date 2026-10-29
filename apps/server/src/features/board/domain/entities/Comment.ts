import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";

export const COMMENT_MAX_LENGTH = 2000;

export interface Comment {
  id: string;
  boardId: string;
  pageId: string;
  x: number;
  y: number;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: Date;
  resolvedAt: Date | null;
  parentId: string | null;
}

export const newComment = (
  input: Pick<Comment, "id" | "boardId" | "authorId" | "authorName"> & {
    pageId: string;
    x: number;
    y: number;
    body: string;
    parentId: string | null;
  },
  now: Date
): Result<Comment, AppError> => {
  const body = input.body.trim();
  if (body.length < 1 || body.length > COMMENT_MAX_LENGTH) {
    return err(
      AppError.validation(
        `Comment must be 1 to ${COMMENT_MAX_LENGTH} characters`
      )
    );
  }
  if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) {
    return err(AppError.validation("Comment position must be finite numbers"));
  }
  if (input.pageId.length < 1) {
    return err(AppError.validation("pageId is required"));
  }
  return ok({ ...input, body, createdAt: now, resolvedAt: null });
};
