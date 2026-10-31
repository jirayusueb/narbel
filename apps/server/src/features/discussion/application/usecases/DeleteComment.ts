import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, okEmpty } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { mayDelete } from "../../domain/entities/Thread";
import { commentsDeleted } from "../DiscussionEvents";
import type { DiscussionTx } from "../ports/DiscussionTx";
import type { IBoardAccess } from "../ports/IBoardAccess";

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
      if (!mayDelete(comment, input.actor.userId, ownsBoard)) {
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
