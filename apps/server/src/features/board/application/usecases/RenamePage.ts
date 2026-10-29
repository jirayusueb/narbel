import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Page } from "../../domain/entities/Page";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import type { IBoardScenes } from "../ports/IBoardScenes";
import { validPageName } from "./AddPage";

export class RenamePage {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly scenes: IBoardScenes
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    pageId: string;
    name: string;
  }): Promise<Result<Page, AppError>> {
    const granted = await this.guard.require(input.boardId, input.actor, "write");
    if (granted.isErr()) {
      return err(granted.error);
    }
    const name = validPageName(input.name);
    if (name.isErr()) {
      return err(name.error);
    }
    const found = await this.scenes.transact(input.boardId, (s) =>
      s.renamePage(input.pageId, name.value)
    );
    return found
      ? ok({ id: input.pageId, name: name.value })
      : err(AppError.notFound("Page"));
  }
}
