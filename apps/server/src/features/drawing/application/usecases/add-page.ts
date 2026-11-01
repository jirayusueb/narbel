import type { IIdGenerator } from "../../../../shared/application/interfaces/i-id-generator";
import type { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { Page } from "../../domain/entities/page";
import type { IBoardAccess } from "../ports/i-board-access";
import type { IBoardScenes } from "../ports/i-board-scenes";

export class AddPage {
  constructor(
    private readonly policy: IBoardAccess,
    private readonly scenes: IBoardScenes,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
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
    const page = Page.create(`page:${this.ids.generate()}`, name.value);
    await this.scenes.transact(input.boardId, (s) => {
      s.addPage(page);
    });
    return ok(page);
  }
}
