import type { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err, okEmpty } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import type { AccessPolicy } from "../access-policy";
import type { IBoardRepository } from "../ports/i-board-repository";
import type { ILiveDrawings } from "../ports/i-drawings";

/** Moves a board to Trash and sends everyone connected away. Nothing is deleted. */
export class TrashBoard {
  constructor(
    private readonly policy: AccessPolicy,
    private readonly boards: IBoardRepository,
    private readonly drawings: ILiveDrawings,
    private readonly now: () => Date = () => new Date()
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
    await this.boards.setTrashed(input.boardId, this.now());
    // also on a repeat call, so a crash after the row changed still ends with the peers gone
    try {
      await this.drawings.evict(input.boardId);
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
