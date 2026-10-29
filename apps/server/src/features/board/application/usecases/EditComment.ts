import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { withBody } from "../../domain/entities/Comment";
import { extractMentions } from "../../domain/rules/mentions";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import { memberIdsOf, requirePerson } from "../BoardPeople";
import { CommentEvents } from "../CommentEvents";
import { presentOne } from "../CommentPresenter";
import type { CommentDto } from "../dtos/CommentDto";
import type { BoardTx } from "../ports/BoardTx";

export class EditComment {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly uow: IUnitOfWork<BoardTx>
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    commentId: string;
    body: string;
  }): Promise<Result<CommentDto, AppError>> {
    const granted = await this.guard.require(
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
      if (comment.authorId !== actor.value.id) {
        return err(AppError.forbidden("Only the author can edit a comment"));
      }
      const edited = withBody(comment, input.body, new Date());
      if (edited.isErr()) {
        return err(edited.error);
      }
      await tx.comments.save(edited.value);
      // people already named before the edit are not told again
      await new CommentEvents(tx, actor.value, edited.value).mentions(
        await memberIdsOf(board, tx.grants),
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
