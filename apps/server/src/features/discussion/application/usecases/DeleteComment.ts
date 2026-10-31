import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, okEmpty } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { mayDelete } from "../../domain/entities/Thread";
import type { IBoardAccess } from "../ports/IBoardAccess";
import type { IBoardCommentRepository } from "../ports/ICommentRepository";

export class DeleteComment {
  constructor(
    private readonly guard: IBoardAccess,
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
    if (
      !mayDelete(
        comment,
        input.actor.userId,
        granted.value.access.role === "owner"
      )
    ) {
      return err(AppError.forbidden("Only the author or the owner can delete"));
    }
    await this.comments.delete(input.boardId, input.commentId);
    return okEmpty();
  }
}
