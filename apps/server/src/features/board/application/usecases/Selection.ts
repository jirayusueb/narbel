import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import { patchElement, stripReserved } from "../connectors";
import { toSceneElementDto } from "../dtos/SceneDto";
import type { SceneElementDto } from "../dtos/SceneDto";
import type { IBoardScenes, SceneAccess } from "../ports/IBoardScenes";

export interface SelectionDto {
  ids: string[];
  elements: SceneElementDto[];
}

const noClient = () =>
  AppError.notFound("Selection (no browser is connected to this board)");

const liveDtos = (s: SceneAccess, ids: string[]): SceneElementDto[] =>
  ids.flatMap((id) => {
    const found = s.find(id);
    return found && !found.element.isDeleted
      ? [
          toSceneElementDto(found.element, (label) =>
            s.get(found.pageId, label)
          ),
        ]
      : [];
  });

const firstLive = (s: SceneAccess, ids: string[]) =>
  ids
    .map((id) => s.find(id))
    .find((found) => found && !found.element.isDeleted);

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
      liveDtos(s, ids)
    );
    return ok({ ids: elements.map((e) => e.id), elements });
  }
}

export class SelectElements {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly scenes: IBoardScenes
  ) {}

  /** `reveal` (the focus tool) also requires at least one live element and brings it into viewers' view. */
  async execute(input: {
    actor: Actor;
    boardId: string;
    ids: string[];
    reveal?: boolean;
  }): Promise<Result<SelectionDto, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const { elements, pageId } = await this.scenes.transact(
      input.boardId,
      (s) => ({
        elements: liveDtos(s, input.ids),
        pageId: firstLive(s, input.ids)?.pageId,
      })
    );
    if (input.reveal && elements.length === 0) {
      return err(AppError.notFound("Elements"));
    }
    const ids = elements.map((e) => e.id);
    await this.scenes.setSelection(input.boardId, {
      pageId,
      ids,
      reveal: Boolean(input.reveal),
    });
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
  }): Promise<Result<{ updated: string[]; locked?: string[] }, AppError>> {
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
    const outcomes = await this.scenes.transact(input.boardId, (s) =>
      selected.map((id) => ({
        id,
        outcome: patchElement(s, this.ids, id, patch),
      }))
    );
    const ofOutcome = (wanted: string) =>
      outcomes.filter((o) => o.outcome === wanted).map((o) => o.id);
    const locked = ofOutcome("locked");
    return ok({
      updated: ofOutcome("ok"),
      ...(locked.length > 0 ? { locked } : {}),
    });
  }
}
