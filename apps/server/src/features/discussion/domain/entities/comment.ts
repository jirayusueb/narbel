import { AppError } from "../../../../shared/kernel/errors/app-error";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";

const COMMENT_MAX_LENGTH = 2000;

export interface CommentFields {
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

type NewCommentInput = Pick<
  CommentFields,
  "id" | "boardId" | "authorId" | "pageId" | "x" | "y"
> & {
  body: string;
  parentId: string | null;
  assigneeId: string | null;
};

const assigneeRefused = (): Result<Thread, AppError> =>
  err(AppError.validation("Assignee must have access to the board"));

export class Comment implements CommentFields {
  readonly id: string;
  readonly boardId: string;
  readonly pageId: string;
  readonly x: number;
  readonly y: number;
  readonly body: string;
  readonly authorId: string;
  readonly createdAt: Date;
  readonly editedAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly resolvedById: string | null;
  readonly assigneeId: string | null;
  readonly parentId: string | null;

  // protected, not private: Thread extends Comment
  protected constructor(fields: CommentFields) {
    this.id = fields.id;
    this.boardId = fields.boardId;
    this.pageId = fields.pageId;
    this.x = fields.x;
    this.y = fields.y;
    this.body = fields.body;
    this.authorId = fields.authorId;
    this.createdAt = fields.createdAt;
    this.editedAt = fields.editedAt;
    this.resolvedAt = fields.resolvedAt;
    this.resolvedById = fields.resolvedById;
    this.assigneeId = fields.assigneeId;
    this.parentId = fields.parentId;
  }

  static new(input: NewCommentInput, now: Date): Result<Comment, AppError> {
    const body = Comment.validateBody(input.body);
    if (body.isErr()) {
      return err(body.error);
    }
    if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) {
      return err(
        AppError.validation("Comment position must be finite numbers")
      );
    }
    if (input.pageId.length < 1) {
      return err(AppError.validation("pageId is required"));
    }
    return ok(
      Comment.restore({
        ...input,
        body: body.value,
        createdAt: now,
        editedAt: null,
        resolvedAt: null,
        resolvedById: null,
      })
    );
  }

  /** Rebuilds a stored comment. */
  static restore(fields: CommentFields): Comment {
    return new Comment(fields);
  }

  private static validateBody(raw: string): Result<string, AppError> {
    const body = raw.trim();
    return body.length < 1 || body.length > COMMENT_MAX_LENGTH
      ? err(
          AppError.validation(
            `Comment must be 1 to ${COMMENT_MAX_LENGTH} characters`
          )
        )
      : ok(body);
  }

  threadId() {
    return this.parentId ?? this.id;
  }

  /** Only the author edits a comment's body, root or reply. */
  editBody(
    editorId: string,
    raw: string,
    now: Date
  ): Result<Comment, AppError> {
    if (this.authorId !== editorId) {
      return err(AppError.forbidden("Only the author can edit a comment"));
    }
    const body = Comment.validateBody(raw);
    return body.isErr()
      ? err(body.error)
      : ok(Comment.restore({ ...this, body: body.value, editedAt: now }));
  }

  /** The author or the board's owner deletes a comment. */
  mayDelete(actorId: string | undefined, actorOwnsBoard: boolean) {
    return actorOwnsBoard || this.authorId === actorId;
  }
}

/**
 * The Thread aggregate: a root comment pinned to a page, with its assignee and resolution. Replies
 * are created only through `reply`, so a reply to a reply cannot exist.
 */
export class Thread extends Comment {
  declare readonly parentId: null;

  /** The thread a root comment is; null for a reply. */
  static of(comment: Comment): Thread | null {
    return comment.parentId === null ? new Thread(comment) : null;
  }

  /** Starts a thread; an assignee must be a member of the board right now. */
  static start(
    input: Omit<NewCommentInput, "parentId">,
    members: Set<string>,
    now: Date
  ): Result<Thread, AppError> {
    if (input.assigneeId && !members.has(input.assigneeId)) {
      return assigneeRefused();
    }
    const comment = Comment.new({ ...input, parentId: null }, now);
    return comment.isErr()
      ? err(comment.error)
      : ok(new Thread({ ...comment.value, parentId: null }));
  }

  /** A reply sits where its thread sits and always points at the thread's root. */
  reply(
    input: Pick<CommentFields, "id" | "authorId"> & { body: string },
    now: Date
  ): Result<Comment, AppError> {
    return Comment.new(
      {
        ...input,
        boardId: this.boardId,
        pageId: this.pageId,
        x: this.x,
        y: this.y,
        parentId: this.id,
        assigneeId: null,
      },
      now
    );
  }

  /** Makes one member responsible, or nobody with `null`; unchanged when it is the same person. */
  assign(
    assigneeId: string | null,
    members: Set<string>
  ): Result<Thread, AppError> {
    if (assigneeId && !members.has(assigneeId)) {
      return assigneeRefused();
    }
    return ok(new Thread({ ...this, assigneeId }));
  }

  /** Resolving a resolved thread changes nothing. */
  resolve(by: string, now: Date): Thread {
    return this.resolvedAt
      ? this
      : new Thread({ ...this, resolvedAt: now, resolvedById: by });
  }

  /** Reopening an open thread changes nothing. */
  reopen(): Thread {
    return this.resolvedAt
      ? new Thread({ ...this, resolvedAt: null, resolvedById: null })
      : this;
  }
}
