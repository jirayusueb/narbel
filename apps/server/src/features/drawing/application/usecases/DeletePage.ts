import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, okEmpty } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { pageRemoval } from "../../domain/entities/Drawing";
import type { IBoardAccess } from "../ports/IBoardAccess";
import type { IBoardScenes } from "../ports/IBoardScenes";

export class DeletePage {
  constructor(
    private readonly policy: IBoardAccess,
    private readonly scenes: IBoardScenes
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    pageId: string;
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
      const removal = pageRemoval(s.pages(), input.pageId);
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
