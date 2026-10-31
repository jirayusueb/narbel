import type { IFileStorage } from "../../../../shared/application/interfaces/IFileStorage";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, okEmpty } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { boardFilePrefix } from "../../domain/values/FileKey";
import type { AccessPolicy } from "../AccessPolicy";
import type { BoardTx } from "../ports/BoardTx";
import type { IBoardScenes } from "../ports/IBoardScenes";

/** Permanently deletes a board that is in Trash. A live board is never purged. */
export class PurgeBoard {
  constructor(
    private readonly policy: AccessPolicy,
    private readonly uow: IUnitOfWork<BoardTx>,
    private readonly scenes: IBoardScenes,
    private readonly storage: IFileStorage
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
    // The row goes first and only while it is still in Trash, so a concurrent restore wins cleanly.
    // A crash after this commit leaves stored files behind (kept bytes), never a board without them.
    const deleted = await this.uow.run(async (tx) => {
      // notifications that point at the board go with it, or they would open a dead page
      await tx.notifications.deleteForBoard(input.boardId);
      return tx.boards.deleteTrashed(input.boardId);
    });
    if (!deleted) {
      return err(AppError.conflict("The board is no longer in the trash"));
    }
    await this.scenes.discard(input.boardId);
    await this.storage.deletePrefix(boardFilePrefix(input.boardId));
    return okEmpty();
  }
}
