import type { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err, okEmpty } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import type { AccessPolicy } from "../access-policy";
import type { IBoardRepository } from "../ports/i-board-repository";

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
