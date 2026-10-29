import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, okEmpty } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import type { IBoardAccessRepository } from "../ports/IBoardAccessRepository";

export class RemoveBoardMember {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly grants: IBoardAccessRepository
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
    const removed = await this.grants.removeMember(input.boardId, input.member);
    return removed ? okEmpty() : err(AppError.notFound("Member"));
  }
}
