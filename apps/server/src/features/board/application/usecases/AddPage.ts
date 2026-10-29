import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { PAGE_NAME_MAX_LENGTH } from "../../domain/entities/Page";
import type { Page } from "../../domain/entities/Page";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import type { IBoardScenes } from "../ports/IBoardScenes";

export const validPageName = (raw: string): Result<string, AppError> => {
  const name = raw.trim();
  return name.length < 1 || name.length > PAGE_NAME_MAX_LENGTH
    ? err(
        AppError.validation(
          `Page name must be 1 to ${PAGE_NAME_MAX_LENGTH} characters`
        )
      )
    : ok(name);
};

export class AddPage {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly scenes: IBoardScenes,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    name: string;
  }): Promise<Result<Page, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const name = validPageName(input.name);
    if (name.isErr()) {
      return err(name.error);
    }
    const page = { id: `page:${this.ids.generate()}`, name: name.value };
    await this.scenes.transact(input.boardId, (s) => {
      s.addPage(page);
    });
    return ok(page);
  }
}
