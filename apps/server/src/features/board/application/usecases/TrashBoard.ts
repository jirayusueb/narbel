import type { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, okEmpty } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { BoardAccessGuard } from "../BoardAccess";
import type { IBoardRepository } from "../ports/IBoardRepository";
import type { IBoardScenes } from "../ports/IBoardScenes";

/** Moves a board to Trash and sends everyone connected away. Nothing is deleted. */
export class TrashBoard {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly boards: IBoardRepository,
    private readonly scenes: IBoardScenes,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
  }): Promise<Result<undefined, AppError>> {
    const owned = await this.guard.requireOwnedAnyState(
      input.boardId,
      input.actor
    );
    if (owned.isErr()) {
      return err(owned.error);
    }
    await this.boards.setTrashed(input.boardId, this.now());
    // also on a repeat call, so a crash after the row changed still ends with the peers gone
    try {
      await this.scenes.evict(input.boardId);
    } catch (error) {
      // the row is already trashed and the hub closed the peers; it keeps the unsaved room and retries the save itself
      console.error(
        `Board ${input.boardId} is trashed but its room is not yet saved`,
        error
      );
    }
    return okEmpty();
  }
}
