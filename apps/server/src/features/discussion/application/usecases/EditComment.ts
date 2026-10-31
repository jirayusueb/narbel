import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { requirePerson } from "../../../../shared/application/requirePerson";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { editBody } from "../../domain/entities/Thread";
import { extractMentions } from "../../domain/rules/mentions";
import { presentOne } from "../CommentPresenter";
import { DiscussionEvents } from "../DiscussionEvents";
import type { CommentDto } from "../dtos/CommentDto";
import type { DiscussionTx } from "../ports/DiscussionTx";
import type { IBoardAccess } from "../ports/IBoardAccess";

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
      const edited = editBody(comment, actor.value.id, input.body, new Date());
      if (edited.isErr()) {
        return err(edited.error);
      }
      await tx.comments.update(board.id, comment.id, {
        body: edited.value.body,
        editedAt: edited.value.editedAt,
      });
      // people already named before the edit are not told again
      await new DiscussionEvents(tx, actor.value, edited.value).mentions(
        await tx.members.memberIds(board),
        extractMentions(comment.body)
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
