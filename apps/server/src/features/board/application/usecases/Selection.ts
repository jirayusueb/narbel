import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import { patchElement, stripReserved } from "../connectors";
import { toSceneElementDto } from "../dtos/SceneDto";
import type { SceneElementDto } from "../dtos/SceneDto";
import type { IBoardScenes } from "../ports/IBoardScenes";

export interface SelectionDto {
  ids: string[];
  elements: SceneElementDto[];
}

const noClient = () =>
  AppError.notFound("Selection (no browser is connected to this board)");

/** Selection lives in awareness, which only the live hub sees; these tools follow the newest client selection. */
export class GetSelection {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly scenes: IBoardScenes
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
  }): Promise<Result<SelectionDto, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "read"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const ids = await this.scenes.getSelection(input.boardId);
    if (!ids) {
      return err(noClient());
    }
    const elements = await this.scenes.transact(input.boardId, (s) =>
      ids.flatMap((id) => {
        const found = s.find(id);
        return found && !found.element.isDeleted
          ? [toSceneElementDto(found.element)]
          : [];
      })
    );
    return ok({ ids: elements.map((e) => e.id), elements });
  }
}

export class SelectElements {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly scenes: IBoardScenes
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    ids: string[];
  }): Promise<Result<SelectionDto, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const elements = await this.scenes.transact(input.boardId, (s) =>
      input.ids.flatMap((id) => {
        const found = s.find(id);
        return found && !found.element.isDeleted
          ? [toSceneElementDto(found.element)]
          : [];
      })
    );
    const ids = elements.map((e) => e.id);
    await this.scenes.setSelection(input.boardId, ids);
    return ok({ ids, elements });
  }
}

export class EditSelection {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly scenes: IBoardScenes,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    patch: Record<string, unknown>;
  }): Promise<Result<{ updated: string[] }, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const selected = await this.scenes.getSelection(input.boardId);
    if (!selected) {
      return err(noClient());
    }
    const patch = stripReserved(input.patch);
    const updated = await this.scenes.transact(input.boardId, (s) =>
      selected.filter((id) => patchElement(s, this.ids, id, patch) === "ok")
    );
    return ok({ updated });
  }
}
