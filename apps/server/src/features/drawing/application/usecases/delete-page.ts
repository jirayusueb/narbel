import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import type { BoardId } from "../../../../shared/kernel/types/ids";
import { err, okEmpty } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { Drawing } from "../../domain/entities/drawing";
import type { PageId } from "../../domain/entities/page";
import type { IBoardAccess } from "../ports/i-board-access";
import type { IBoardScenes } from "../ports/i-board-scenes";

export class DeletePage {
  constructor(
    private readonly policy: IBoardAccess,
    private readonly scenes: IBoardScenes
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: BoardId;
    pageId: PageId;
  }): Promise<Result<undefined, AppError>> {
    const granted = await this.policy.decide(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const outcome = await this.scenes.transact(input.boardId, (s) => {
      const removal = Drawing.pageRemoval(s.pages(), input.pageId);
      if (removal === "removable") {
        s.removePage(input.pageId);
      }
      return removal;
    });
    if (outcome === "missing") {
      return err(AppError.notFound("Page"));
    }
    return outcome === "last"
      ? err(AppError.conflict("A board needs at least one page"))
      : okEmpty();
  }
}
