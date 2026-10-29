import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { newComment } from "../../domain/entities/Comment";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import { toCommentDto } from "../dtos/CommentDto";
import type { CommentDto } from "../dtos/CommentDto";
import type { IBoardCommentRepository } from "../ports/IBoardCommentRepository";

export class AddComment {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly comments: IBoardCommentRepository,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    pageId: string;
    x: number;
    y: number;
    body: string;
    parentId?: string;
  }): Promise<Result<CommentDto, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const { userId, name } = input.actor;
    if (!userId) {
      return err(AppError.unauthorized());
    }
    if (
      input.parentId &&
      !(await this.comments.findById(input.boardId, input.parentId))
    ) {
      return err(AppError.notFound("Comment"));
    }
    const comment = newComment(
      {
        id: this.ids.generate(),
        boardId: input.boardId,
        pageId: input.pageId,
        x: input.x,
        y: input.y,
        body: input.body,
        authorId: userId,
        authorName: name ?? "Unknown",
        parentId: input.parentId ?? null,
      },
      new Date()
    );
    if (comment.isErr()) {
      return err(comment.error);
    }
    await this.comments.save(comment.value);
    return ok(toCommentDto(comment.value));
  }
}
