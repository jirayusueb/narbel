import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { requirePerson } from "../../../../shared/application/requirePerson";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { isThread, reopen, resolve } from "../../domain/entities/Thread";
import { presentOne } from "../CommentPresenter";
import { DiscussionEvents } from "../DiscussionEvents";
import type { CommentDto } from "../dtos/CommentDto";
import type { DiscussionTx } from "../ports/DiscussionTx";
import type { IBoardAccess } from "../ports/IBoardAccess";

/** Resolves or reopens the thread `commentId` belongs to. Repeating either is a no-op. */
export class ResolveComment {
  constructor(
    private readonly guard: IBoardAccess,
    private readonly uow: IUnitOfWork<DiscussionTx>
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
      if (!(root && isThread(root))) {
        return err(AppError.notFound("Comment"));
      }
      const next = input.resolve
        ? resolve(root, actor.value.id, new Date())
        : reopen(root);
      if (next.resolvedAt?.getTime() !== root.resolvedAt?.getTime()) {
        await tx.comments.update(board.id, root.id, {
          resolvedAt: next.resolvedAt,
          resolvedById: next.resolvedById,
        });
        if (input.resolve) {
          await new DiscussionEvents(tx, actor.value, next).resolved(
            next,
            await tx.members.idsOf(board)
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
