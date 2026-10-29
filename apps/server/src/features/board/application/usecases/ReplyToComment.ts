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

export class ReplyToComment {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly uow: IUnitOfWork<BoardTx>,
    private readonly ids: IIdGenerator
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
      if (!root) {
        return err(AppError.notFound("Comment"));
      }
      const reply = newComment(
        {
          id: this.ids.generate(),
          boardId: board.id,
          pageId: root.pageId,
          x: root.x,
          y: root.y,
          body: input.body,
          authorId: actor.value.id,
          parentId: root.id,
          assigneeId: null,
        },
        new Date()
      );
      if (reply.isErr()) {
        return err(reply.error);
      }
      await tx.comments.save(reply.value);
      const events = new CommentEvents(tx, actor.value, reply.value);
      const mentioned = await events.mentions(
        await memberIdsOf(board, tx.grants)
      );
      await events.reply(root, mentioned);
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
