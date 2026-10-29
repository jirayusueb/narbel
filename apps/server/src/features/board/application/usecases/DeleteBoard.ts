import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, okEmpty } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { boardFilePrefix } from "../../domain/values/FileKey";
import { loadOwnedBoard } from "../BoardAccess";
import type { IBoardRepository } from "../ports/IBoardRepository";
import type { IBoardScenes } from "../ports/IBoardScenes";
import type { IFileStorage } from "../ports/IFileStorage";

export class DeleteBoard {
  constructor(
    private readonly boards: IBoardRepository,
    private readonly scenes: IBoardScenes,
    private readonly storage: IFileStorage
  ) {}

  async execute(input: {
    userId: string;
    boardId: string;
  }): Promise<Result<undefined, AppError>> {
    const board = await loadOwnedBoard(
      this.boards,
      input.boardId,
      input.userId
    );
    if (board.isErr()) {
      return err(board.error);
    }
    // Every step is idempotent, so a failed delete can simply be retried.
    await this.scenes.discard(input.boardId);
    await this.storage.deletePrefix(boardFilePrefix(input.boardId));
    await this.boards.delete(input.boardId);
    return okEmpty();
  }
}
