import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { requirePerson } from "../../../../shared/application/requirePerson";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { assign, isThread } from "../../domain/entities/Thread";
import { presentOne } from "../CommentPresenter";
import { DiscussionEvents } from "../DiscussionEvents";
import type { CommentDto } from "../dtos/CommentDto";
import type { DiscussionTx } from "../ports/DiscussionTx";
import type { IBoardAccess } from "../ports/IBoardAccess";

export class AssignComment {
  constructor(
    private readonly guard: IBoardAccess,
    private readonly uow: IUnitOfWork<DiscussionTx>
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    commentId: string;
    assigneeId: string | null;
  }): Promise<Result<CommentDto, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const { board } = granted.value;
    return await this.uow.run(async (tx) => {
      const actor = await requirePerson(tx.profiles, input.actor.userId);
      if (actor.isErr()) {
        return err(actor.error);
      }
      const comment = await tx.comments.findById(board.id, input.commentId);
      if (!(comment && isThread(comment))) {
        return err(AppError.notFound("Comment"));
      }
      const assigned = assign(
        comment,
        input.assigneeId,
        await tx.members.idsOf(board)
      );
      if (assigned.isErr()) {
        return err(assigned.error);
      }
      const next = assigned.value;
      const { assigneeId } = next;
      if (assigneeId !== comment.assigneeId) {
        await tx.comments.update(board.id, comment.id, { assigneeId });
        const [assignee] = assigneeId
          ? await tx.profiles.findPeople([assigneeId])
          : [];
        if (assignee) {
          await new DiscussionEvents(tx, actor.value, next).assigned(assignee);
        }
      }
      return await presentOne(
        tx.comments,
        tx.profiles,
        board.id,
        comment.id,
        actor.value.id
      );
    });
  }
}
