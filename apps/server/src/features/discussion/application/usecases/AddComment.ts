import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { requirePerson } from "../../../../shared/application/requirePerson";
import type { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { startThread } from "../../domain/entities/Thread";
import { presentOne } from "../CommentPresenter";
import { DiscussionEvents } from "../DiscussionEvents";
import type { CommentDto } from "../dtos/CommentDto";
import type { DiscussionTx } from "../ports/DiscussionTx";
import type { IBoardAccess } from "../ports/IBoardAccess";

export class AddComment {
  constructor(
    private readonly guard: IBoardAccess,
    private readonly uow: IUnitOfWork<DiscussionTx>,
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
      const members = await tx.members.idsOf(board);
      const comment = startThread(
        {
          id: this.ids.generate(),
          boardId: board.id,
          pageId: input.pageId,
          x: input.x,
          y: input.y,
          body: input.body,
          authorId: actor.value.id,
          assigneeId: input.assigneeId ?? null,
        },
        members,
        new Date()
      );
      if (comment.isErr()) {
        return err(comment.error);
      }
      const assignee = comment.value.assigneeId;
      await tx.comments.save(comment.value);
      const events = new DiscussionEvents(tx, actor.value, comment.value);
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
