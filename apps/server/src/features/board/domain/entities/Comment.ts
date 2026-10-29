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
  createdAt: Date;
  editedAt: Date | null;
  resolvedAt: Date | null;
  resolvedById: string | null;
  assigneeId: string | null;
  /** null for a thread root; replies are one level deep and always point at the root */
  parentId: string | null;
}

export const threadIdOf = (comment: Comment) => comment.parentId ?? comment.id;

export const validateCommentBody = (raw: string): Result<string, AppError> => {
  const body = raw.trim();
  return body.length < 1 || body.length > COMMENT_MAX_LENGTH
    ? err(
        AppError.validation(
          `Comment must be 1 to ${COMMENT_MAX_LENGTH} characters`
        )
      )
    : ok(body);
};

export const newComment = (
  input: Pick<Comment, "id" | "boardId" | "authorId" | "pageId" | "x" | "y"> & {
    body: string;
    parentId: string | null;
    assigneeId: string | null;
  },
  now: Date
): Result<Comment, AppError> => {
  const body = validateCommentBody(input.body);
  if (body.isErr()) {
    return err(body.error);
  }
  if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) {
    return err(AppError.validation("Comment position must be finite numbers"));
  }
  if (input.pageId.length < 1) {
    return err(AppError.validation("pageId is required"));
  }
  return ok({
    ...input,
    body: body.value,
    createdAt: now,
    editedAt: null,
    resolvedAt: null,
    resolvedById: null,
  });
};

export const withBody = (
  comment: Comment,
  raw: string,
  now: Date
): Result<Comment, AppError> => {
  const body = validateCommentBody(raw);
  return body.isErr()
    ? err(body.error)
    : ok({ ...comment, body: body.value, editedAt: now });
};

export const resolved = (comment: Comment, by: string, now: Date): Comment =>
  comment.resolvedAt
    ? comment
    : { ...comment, resolvedAt: now, resolvedById: by };

export const reopened = (comment: Comment): Comment => ({
  ...comment,
  resolvedAt: null,
  resolvedById: null,
});
