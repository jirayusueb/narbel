import type { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, okEmpty } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { AccessPolicy } from "../AccessPolicy";
import type { IBoardRepository } from "../ports/IBoardRepository";

/** Takes a board out of Trash. Members, share links, pages and images were never touched, so they work again. */
export class RestoreBoard {
  constructor(
    private readonly policy: AccessPolicy,
    private readonly boards: IBoardRepository
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
    await this.boards.setTrashed(input.boardId, null);
    return okEmpty();
  }
}
