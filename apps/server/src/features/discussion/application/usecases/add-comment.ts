import type { IIdGenerator } from "../../../../shared/application/interfaces/i-id-generator";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/i-unit-of-work";
import { requirePerson } from "../../../../shared/application/require-person";
import type { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { Thread } from "../../domain/entities/comment";
import { presentOne } from "../comment-presenter";
import { commentChanged, DiscussionEvents } from "../discussion-events";
import type { CommentDto } from "../dtos/comment-dto";
import type { DiscussionTx } from "../ports/discussion-tx";
import type { IBoardAccess } from "../ports/i-board-access";

export class AddComment {
  constructor(
    private readonly access: IBoardAccess,
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
      const members = await tx.members.memberIds(board);
      const comment = Thread.start(
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
      await tx.outbox.publish(
        commentChanged(
          "event.comment-posted",
          comment.value,
          comment.value.createdAt
        )
      );
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
