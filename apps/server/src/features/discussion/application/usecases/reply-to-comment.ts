import type { IIdGenerator } from "../../../../shared/application/interfaces/i-id-generator";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/i-unit-of-work";
import { requirePerson } from "../../../../shared/application/require-person";
import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { Thread } from "../../domain/entities/comment";
import { presentOne } from "../comment-presenter";
import { commentChanged, DiscussionEvents } from "../discussion-events";
import type { CommentDto } from "../dtos/comment-dto";
import type { DiscussionTx } from "../ports/discussion-tx";
import type { IBoardAccess } from "../ports/i-board-access";

export class ReplyToComment {
  constructor(
    private readonly access: IBoardAccess,
    private readonly uow: IUnitOfWork<DiscussionTx>,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    commentId: string;
    body: string;
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
      const target = await tx.comments.findById(board.id, input.commentId);
      // replies are one level deep: answering a reply answers its thread
      const root = target?.parentId
        ? await tx.comments.findById(board.id, target.parentId)
        : target;
      const thread = root && Thread.of(root);
      if (!(root && thread)) {
        return err(AppError.notFound("Comment"));
      }
      const reply = thread.reply(
        { id: this.ids.generate(), body: input.body, authorId: actor.value.id },
        new Date()
      );
      if (reply.isErr()) {
        return err(reply.error);
      }
      await tx.comments.save(reply.value);
      await tx.outbox.publish(
        commentChanged(
          "event.comment-posted",
          reply.value,
          reply.value.createdAt
        )
      );
      const events = new DiscussionEvents(tx, actor.value, reply.value);
      const members = await tx.members.memberIds(board);
      const mentioned = await events.mentions(members);
      await events.reply(root, mentioned, members);
      return await presentOne(
        tx.comments,
        tx.profiles,
        board.id,
        reply.value.id,
        actor.value.id
      );
    });
  }
}
