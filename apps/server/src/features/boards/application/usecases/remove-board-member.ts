import type { BoardsEvent } from "../../../../shared/application/events/boards-event";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/i-unit-of-work";
import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err, okEmpty } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import type { AccessPolicy } from "../access-policy";
import type { BoardTx } from "../ports/board-tx";

export class RemoveBoardMember {
  constructor(
    private readonly policy: AccessPolicy,
    private readonly uow: IUnitOfWork<BoardTx>
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    /** user id, or the invited email of a member who has not signed in yet */
    member: string;
  }): Promise<Result<undefined, AppError>> {
    const granted = await this.policy.decide(
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
      // discussion unassigns the person, notification forgets the invite email, live peers are re-decided
      const event: BoardsEvent = {
        type: "event.member-removed",
        version: 1,
        boardId: input.boardId,
        email: removed.email,
        personId: removed.userId,
      };
      await tx.outbox.publish(event);
      return okEmpty();
    });
  }
}
