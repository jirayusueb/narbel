import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { newComment } from "../../domain/entities/Comment";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import { memberIdsOf, requirePerson } from "../BoardPeople";
import { CommentEvents } from "../CommentEvents";
import { presentOne } from "../CommentPresenter";
import type { CommentDto } from "../dtos/CommentDto";
import type { BoardTx } from "../ports/BoardTx";

export class AddComment {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly uow: IUnitOfWork<BoardTx>,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    pageId: string;
    x: number;
    y: number;
    body: string;
    assigneeId?: string;
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
      const comment = newComment(
        {
          id: this.ids.generate(),
          boardId: board.id,
          pageId: input.pageId,
          x: input.x,
          y: input.y,
          body: input.body,
          authorId: actor.value.id,
          parentId: null,
          assigneeId: input.assigneeId ?? null,
        },
        new Date()
      );
      if (comment.isErr()) {
        return err(comment.error);
      }
      const members = await memberIdsOf(board, tx.grants);
      const assignee = input.assigneeId;
      if (assignee && !members.has(assignee)) {
        return err(
          AppError.validation("Assignee must have access to the board")
        );
      }
      await tx.comments.save(comment.value);
      const events = new CommentEvents(tx, actor.value, comment.value);
      if (assignee) {
        const [person] = await tx.profiles.findPeople([assignee]);
        if (person) {
          await events.assigned(person);
        }
      }
      await events.mentions(members);
      return await presentOne(
        tx.comments,
        tx.profiles,
        board.id,
        comment.value.id,
        actor.value.id
      );
    });
  }
}
