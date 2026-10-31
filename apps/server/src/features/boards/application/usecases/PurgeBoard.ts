import type { BoardsEvent } from "../../../../shared/application/events/BoardsEvent";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, okEmpty } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { AccessPolicy } from "../AccessPolicy";
import type { BoardTx } from "../ports/BoardTx";

/** Permanently deletes a board that is in Trash. A live board is never purged. */
export class PurgeBoard {
  constructor(
    private readonly policy: AccessPolicy,
    private readonly uow: IUnitOfWork<BoardTx>
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
  }): Promise<Result<undefined, AppError>> {
    const owned = await this.policy.decideOwnedAnyState(
      input.boardId,
      input.actor
    );
    if (owned.isErr()) {
      return err(owned.error);
    }
    if (!owned.value.trashedAt) {
      return err(AppError.conflict("Move the board to the trash first"));
    }
    // The row goes only while it is still in Trash, so a concurrent restore wins cleanly. The event
    // commits with it: drawing then closes the room and deletes the files, notification the inbox entries.
    return await this.uow.run(async (tx) => {
      if (!(await tx.boards.deleteTrashed(input.boardId))) {
        return err(AppError.conflict("The board is no longer in the trash"));
      }
      const event: BoardsEvent = {
        type: "event.board-deleted",
        version: 1,
        boardId: input.boardId,
        ownerId: owned.value.ownerId,
      };
      await tx.outbox.publish(event);
      return okEmpty();
    });
  }
}
