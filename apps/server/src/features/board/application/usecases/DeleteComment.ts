import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, okEmpty } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import type { IBoardCommentRepository } from "../ports/IBoardCommentRepository";

export class DeleteComment {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly comments: IBoardCommentRepository
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    commentId: string;
  }): Promise<Result<undefined, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "read"
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
    const mayDelete =
      granted.value.access.role === "owner" ||
      comment.authorId === input.actor.userId;
    if (!mayDelete) {
      return err(AppError.forbidden("Only the author or the owner can delete"));
    }
    await this.comments.delete(input.boardId, input.commentId);
    return okEmpty();
  }
}
