import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { newComment, validateCommentBody } from "./Comment";
import type { Comment } from "./Comment";

/**
 * The Thread aggregate: a root comment pinned to a page, with its assignee and resolution. Replies
 * are created only through `replyTo`, so a reply to a reply cannot exist.
 */
export type Thread = Comment & { parentId: null };

export const isThread = (comment: Comment): comment is Thread =>
  comment.parentId === null;

const assigneeRefused = (): Result<Thread, AppError> =>
  err(AppError.validation("Assignee must have access to the board"));

/** Starts a thread; an assignee must be a member of the board right now. */
export const startThread = (
  input: Pick<Comment, "id" | "boardId" | "authorId" | "pageId" | "x" | "y"> & {
    body: string;
    assigneeId: string | null;
  },
  members: Set<string>,
  now: Date
): Result<Thread, AppError> => {
  if (input.assigneeId && !members.has(input.assigneeId)) {
    return assigneeRefused();
  }
  const comment = newComment({ ...input, parentId: null }, now);
  return comment.isErr()
    ? err(comment.error)
    : ok({ ...comment.value, parentId: null });
};

/** A reply sits where its thread sits and always points at the thread's root. */
export const replyTo = (
  thread: Thread,
  input: Pick<Comment, "id" | "authorId"> & { body: string },
  now: Date
): Result<Comment, AppError> =>
  newComment(
    {
      ...input,
      boardId: thread.boardId,
      pageId: thread.pageId,
      x: thread.x,
      y: thread.y,
      parentId: thread.id,
      assigneeId: null,
    },
    now
  );

/** Makes one member responsible, or nobody with `null`; unchanged when it is the same person. */
export const assign = (
  thread: Thread,
  assigneeId: string | null,
  members: Set<string>
): Result<Thread, AppError> => {
  if (assigneeId && !members.has(assigneeId)) {
    return assigneeRefused();
  }
  return ok({ ...thread, assigneeId });
};

/** Resolving a resolved thread changes nothing. */
export const resolve = (thread: Thread, by: string, now: Date): Thread =>
  thread.resolvedAt ? thread : { ...thread, resolvedAt: now, resolvedById: by };

/** Reopening an open thread changes nothing. */
export const reopen = (thread: Thread): Thread =>
  thread.resolvedAt
    ? { ...thread, resolvedAt: null, resolvedById: null }
    : thread;

/** Only the author edits a comment's body, root or reply. */
export const editBody = (
  comment: Comment,
  editorId: string,
  raw: string,
  now: Date
): Result<Comment, AppError> => {
  if (comment.authorId !== editorId) {
    return err(AppError.forbidden("Only the author can edit a comment"));
  }
  const body = validateCommentBody(raw);
  return body.isErr()
    ? err(body.error)
    : ok({ ...comment, body: body.value, editedAt: now });
};

/** The author or the board's owner deletes a comment. */
export const mayDelete = (
  comment: Comment,
  actorId: string | undefined,
  actorOwnsBoard: boolean
) => actorOwnsBoard || comment.authorId === actorId;
