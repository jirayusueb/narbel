import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import type { IBoardPresence } from "../ports/IBoardPresence";

export interface ViewersDto {
  viewers: { userId: string; name: string | null }[];
  /** open connections without a signed-in user, e.g. share-link visitors */
  anonymous: number;
}

export class ListBoardViewers {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly presence: IBoardPresence
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
  }): Promise<Result<ViewersDto, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "read"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const byUser = new Map<string, string | null>();
    let anonymous = 0;
    for (const { userId, name } of await this.presence.list(input.boardId)) {
      if (userId === null) {
        anonymous += 1;
      } else {
        byUser.set(userId, name);
      }
    }
    return ok({
      viewers: [...byUser].map(([userId, name]) => ({ userId, name })),
      anonymous,
    });
  }
}
