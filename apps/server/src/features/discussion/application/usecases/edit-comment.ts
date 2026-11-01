import type { IUnitOfWork } from "../../../../shared/application/interfaces/i-unit-of-work";
import { requirePerson } from "../../../../shared/application/require-person";
import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { Mentions } from "../../domain/rules/mentions";
import { presentOne } from "../comment-presenter";
import { commentChanged, DiscussionEvents } from "../discussion-events";
import type { CommentDto } from "../dtos/comment-dto";
import type { DiscussionTx } from "../ports/discussion-tx";
import type { IBoardAccess } from "../ports/i-board-access";

export class EditComment {
  constructor(
    private readonly access: IBoardAccess,
    private readonly uow: IUnitOfWork<DiscussionTx>
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
      "read"
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
      if (!comment) {
        return err(AppError.notFound("Comment"));
      }
      const now = new Date();
      const edited = comment.editBody(actor.value.id, input.body, now);
      if (edited.isErr()) {
        return err(edited.error);
      }
      await tx.comments.update(board.id, comment.id, {
        body: edited.value.body,
        editedAt: edited.value.editedAt,
      });
      await tx.outbox.publish(
        commentChanged("event.comment-edited", edited.value, now)
      );
      // people already named before the edit are not told again
      await new DiscussionEvents(tx, actor.value, edited.value).mentions(
        await tx.members.memberIds(board),
        Mentions.extractMentions(comment.body)
      );
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
