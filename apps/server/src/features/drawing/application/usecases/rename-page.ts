import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import type { BoardId } from "../../../../shared/kernel/types/ids";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { Page } from "../../domain/entities/page";
import type { PageId } from "../../domain/entities/page";
import type { IBoardAccess } from "../ports/i-board-access";
import type { IBoardScenes } from "../ports/i-board-scenes";

export class RenamePage {
  constructor(
    private readonly policy: IBoardAccess,
    private readonly scenes: IBoardScenes
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: BoardId;
    pageId: PageId;
    name: string;
  }): Promise<Result<Page, AppError>> {
    const granted = await this.policy.decide(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const name = Page.parseName(input.name);
    if (name.isErr()) {
      return err(name.error);
    }
    const found = await this.scenes.transact(input.boardId, (s) =>
      s.renamePage(input.pageId, name.value)
    );
    return found
      ? ok(Page.create(input.pageId, name.value))
      : err(AppError.notFound("Page"));
  }
}
