import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, okEmpty } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { boardFilePrefix } from "../../domain/values/FileKey";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import type { IBoardRepository } from "../ports/IBoardRepository";
import type { IBoardScenes } from "../ports/IBoardScenes";
import type { IFileStorage } from "../ports/IFileStorage";

export class DeleteBoard {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly boards: IBoardRepository,
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
    await this.boards.delete(input.boardId);
    return okEmpty();
  }
}
