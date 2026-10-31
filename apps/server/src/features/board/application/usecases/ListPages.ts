import type { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Page } from "../../domain/entities/Page";
import type { BoardAccessGuard } from "../BoardAccess";
import type { IBoardScenes } from "../ports/IBoardScenes";

export class ListPages {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly scenes: IBoardScenes
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
  }): Promise<Result<Page[], AppError>> {
    const granted = await this.guard.require(
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
