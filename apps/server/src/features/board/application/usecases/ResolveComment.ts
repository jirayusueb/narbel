import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { reopened, resolved } from "../../domain/entities/Comment";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import { memberIdsOf, requirePerson } from "../BoardPeople";
import { CommentEvents } from "../CommentEvents";
import { presentOne } from "../CommentPresenter";
import type { CommentDto } from "../dtos/CommentDto";
import type { BoardTx } from "../ports/BoardTx";

/** Resolves or reopens the thread `commentId` belongs to. Repeating either is a no-op. */
export class ResolveComment {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly uow: IUnitOfWork<BoardTx>
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    commentId: string;
    resolve: boolean;
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
      const root = target?.parentId
        ? await tx.comments.findById(board.id, target.parentId)
        : target;
      if (!root) {
        return err(AppError.notFound("Comment"));
      }
      const next = input.resolve
        ? resolved(root, actor.value.id, new Date())
        : reopened(root);
      if (next.resolvedAt?.getTime() !== root.resolvedAt?.getTime()) {
        await tx.comments.update(board.id, root.id, {
          resolvedAt: next.resolvedAt,
          resolvedById: next.resolvedById,
        });
        if (input.resolve) {
          await new CommentEvents(tx, actor.value, next).resolved(
            next,
            await memberIdsOf(board, tx.grants)
          );
        }
      }
      return await presentOne(
        tx.comments,
        tx.profiles,
        board.id,
        root.id,
        actor.value.id
      );
    });
  }
}
