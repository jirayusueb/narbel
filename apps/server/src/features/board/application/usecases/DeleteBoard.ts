import type { IFileStorage } from "../../../../shared/application/interfaces/IFileStorage";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, okEmpty } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { boardFilePrefix } from "../../domain/values/FileKey";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import type { BoardTx } from "../ports/BoardTx";
import type { IBoardScenes } from "../ports/IBoardScenes";

export class DeleteBoard {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly uow: IUnitOfWork<BoardTx>,
    private readonly scenes: IBoardScenes,
    private readonly storage: IFileStorage
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
  }): Promise<Result<undefined, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "owner"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    // Every step is idempotent, so a failed delete can simply be retried.
    await this.scenes.discard(input.boardId);
    await this.storage.deletePrefix(boardFilePrefix(input.boardId));
    // notifications that point at the board go with it, or they would open a 404
    await this.uow.run(async (tx) => {
      await tx.notifications.deleteForBoard(input.boardId);
      await tx.boards.delete(input.boardId);
    });
    return okEmpty();
  }
}
