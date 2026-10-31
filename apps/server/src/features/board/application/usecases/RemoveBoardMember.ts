import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, okEmpty } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { BoardAccessGuard } from "../BoardAccess";
import type { BoardTx } from "../ports/BoardTx";

export class RemoveBoardMember {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly uow: IUnitOfWork<BoardTx>
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    /** user id, or the invited email of a member who has not signed in yet */
    member: string;
  }): Promise<Result<undefined, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "owner"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    if (granted.value.board.ownerId === input.member) {
      return err(AppError.validation("The owner cannot be removed"));
    }
    return await this.uow.run(async (tx) => {
      const removed = await tx.grants.removeMember(input.boardId, input.member);
      if (!removed) {
        return err(AppError.notFound("Member"));
      }
      // someone without access cannot own work on the board
      if (removed.userId) {
        await tx.comments.clearAssignee(input.boardId, removed.userId);
      }
      await tx.outbox.forget(`invite:${input.boardId}:${removed.email}`);
      return okEmpty();
    });
  }
}
