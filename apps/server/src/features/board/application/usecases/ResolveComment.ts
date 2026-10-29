import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import { toCommentDto } from "../dtos/CommentDto";
import type { CommentDto } from "../dtos/CommentDto";
import type { IBoardCommentRepository } from "../ports/IBoardCommentRepository";

export class ResolveComment {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly comments: IBoardCommentRepository
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    commentId: string;
  }): Promise<Result<CommentDto, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const comment = await this.comments.findById(
      input.boardId,
      input.commentId
    );
    if (!comment) {
      return err(AppError.notFound("Comment"));
    }
    const resolved = comment.resolvedAt
      ? comment
      : { ...comment, resolvedAt: new Date() };
    await this.comments.save(resolved);
    return ok(toCommentDto(resolved));
  }
}
