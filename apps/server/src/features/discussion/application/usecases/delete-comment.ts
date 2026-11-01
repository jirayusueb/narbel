import type { IUnitOfWork } from "../../../../shared/application/interfaces/i-unit-of-work";
import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err, okEmpty } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { commentsDeleted } from "../discussion-events";
import type { DiscussionTx } from "../ports/discussion-tx";
import type { IBoardAccess } from "../ports/i-board-access";

export class DeleteComment {
  constructor(
    private readonly access: IBoardAccess,
    private readonly uow: IUnitOfWork<DiscussionTx>
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    commentId: string;
  }): Promise<Result<undefined, AppError>> {
    const granted = await this.access.decide(
      input.boardId,
      input.actor,
      "read"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const ownsBoard = granted.value.access.role === "owner";
    return await this.uow.run(async (tx) => {
      const comment = await tx.comments.findById(
        input.boardId,
        input.commentId
      );
      if (!comment) {
        return err(AppError.notFound("Comment"));
      }
      if (!comment.mayDelete(input.actor.userId, ownsBoard)) {
        return err(
          AppError.forbidden("Only the author or the owner can delete")
        );
      }
      const removed = await tx.comments.delete(input.boardId, comment.id);
      await tx.outbox.publish(commentsDeleted(comment, removed, new Date()));
      return okEmpty();
    });
  }
}
