import type { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import type { BoardId } from "../../../../shared/kernel/types/ids";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import type { IBoardAccess } from "../ports/i-board-access";
import type { IBoardPresence } from "../ports/i-board-presence";

export interface ViewersDto {
  viewers: { userId: string; name: string | null }[];
  /** open connections without a signed-in user, e.g. share-link visitors */
  anonymous: number;
}

export class ListBoardViewers {
  constructor(
    private readonly policy: IBoardAccess,
    private readonly presence: IBoardPresence
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: BoardId;
  }): Promise<Result<ViewersDto, AppError>> {
    const granted = await this.policy.decide(
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
