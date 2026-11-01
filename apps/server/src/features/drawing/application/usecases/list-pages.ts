import type { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import type { Page } from "../../domain/entities/page";
import type { IBoardAccess } from "../ports/i-board-access";
import type { IBoardScenes } from "../ports/i-board-scenes";

export class ListPages {
  constructor(
    private readonly policy: IBoardAccess,
    private readonly scenes: IBoardScenes
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
  }): Promise<Result<Page[], AppError>> {
    const granted = await this.policy.decide(
      input.boardId,
      input.actor,
      "read"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    return ok(await this.scenes.transact(input.boardId, (s) => s.pages()));
  }
}
