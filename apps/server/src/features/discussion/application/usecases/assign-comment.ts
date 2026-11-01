import type { IUnitOfWork } from "../../../../shared/application/interfaces/i-unit-of-work";
import { requirePerson } from "../../../../shared/application/require-person";
import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { Thread } from "../../domain/entities/comment";
import { presentOne } from "../comment-presenter";
import { DiscussionEvents } from "../discussion-events";
import type { CommentDto } from "../dtos/comment-dto";
import type { DiscussionTx } from "../ports/discussion-tx";
import type { IBoardAccess } from "../ports/i-board-access";

export class AssignComment {
  constructor(
    private readonly access: IBoardAccess,
    private readonly uow: IUnitOfWork<DiscussionTx>
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    commentId: string;
    assigneeId: string | null;
  }): Promise<Result<CommentDto, AppError>> {
    const granted = await this.access.decide(
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
      const thread = comment && Thread.of(comment);
      if (!(comment && thread)) {
        return err(AppError.notFound("Comment"));
      }
      const assigned = thread.assign(
        input.assigneeId,
        await tx.members.memberIds(board)
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
