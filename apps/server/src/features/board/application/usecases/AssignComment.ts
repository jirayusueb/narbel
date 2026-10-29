import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import { memberIdsOf, requirePerson } from "../BoardPeople";
import { CommentEvents } from "../CommentEvents";
import { presentOne } from "../CommentPresenter";
import type { CommentDto } from "../dtos/CommentDto";
import type { BoardTx } from "../ports/BoardTx";

export class AssignComment {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly uow: IUnitOfWork<BoardTx>
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
      if (!comment || comment.parentId !== null) {
        return err(AppError.notFound("Comment"));
      }
      const { assigneeId } = input;
      const members = await memberIdsOf(board, tx.grants);
      if (assigneeId && !members.has(assigneeId)) {
        return err(
          AppError.validation("Assignee must have access to the board")
        );
      }
      if (assigneeId !== comment.assigneeId) {
        const next = { ...comment, assigneeId };
        await tx.comments.update(board.id, comment.id, { assigneeId });
        const [assignee] = assigneeId
          ? await tx.profiles.findPeople([assigneeId])
          : [];
        if (assignee) {
          await new CommentEvents(tx, actor.value, next).assigned(assignee);
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
