import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, okEmpty } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import type { IBoardScenes } from "../ports/IBoardScenes";

export class DeletePage {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly scenes: IBoardScenes
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    pageId: string;
  }): Promise<Result<undefined, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const outcome = await this.scenes.transact(input.boardId, (s) => {
      if (!s.pages().some((page) => page.id === input.pageId)) {
        return "missing";
      }
      if (s.pages().length === 1) {
        return "last";
      }
      s.removePage(input.pageId);
      return "removed";
    });
    if (outcome === "missing") {
      return err(AppError.notFound("Page"));
    }
    return outcome === "last"
      ? err(AppError.conflict("A board needs at least one page"))
      : okEmpty();
  }
}
