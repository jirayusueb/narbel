import type { IUnitOfWork } from "../../../../shared/application/interfaces/i-unit-of-work";
import { requirePerson } from "../../../../shared/application/require-person";
import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { Thread } from "../../domain/entities/comment";
import { presentOne } from "../comment-presenter";
import { DiscussionEvents } from "../discussion-events";
import type { CommentDto } from "../dtos/comment-dto";
import type { DiscussionTx } from "../ports/discussion-tx";
import type { IBoardAccess } from "../ports/i-board-access";

/** Resolves or reopens the thread `commentId` belongs to. Repeating either is a no-op. */
export class ResolveComment {
  constructor(
    private readonly access: IBoardAccess,
    private readonly uow: IUnitOfWork<DiscussionTx>
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    commentId: string;
    resolve: boolean;
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
      const root = target?.parentId
        ? await tx.comments.findById(board.id, target.parentId)
        : target;
      const thread = root && Thread.of(root);
      if (!(root && thread)) {
        return err(AppError.notFound("Comment"));
      }
      const next = input.resolve
        ? thread.resolve(actor.value.id, new Date())
        : thread.reopen();
      if (next.resolvedAt?.getTime() !== root.resolvedAt?.getTime()) {
        await tx.comments.update(board.id, root.id, {
          resolvedAt: next.resolvedAt,
          resolvedById: next.resolvedById,
        });
        if (input.resolve) {
          await new DiscussionEvents(tx, actor.value, next).resolved(
            next,
            await tx.members.memberIds(board)
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
