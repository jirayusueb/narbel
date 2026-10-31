import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { BoardAccessGuard } from "../BoardAccess";
import { patchElement, stripReserved } from "../connectors";
import type { PatchOutcome, RebindRefs } from "../connectors";
import type { IBoardScenes } from "../ports/IBoardScenes";

const FAILURES: Record<Exclude<PatchOutcome, "ok">, () => AppError> = {
  missing: () => AppError.notFound("Element"),
  "not-connector": () =>
    AppError.validation(
      "startElementId/endElementId apply to arrows and lines only"
    ),
  "missing-ref": () =>
    AppError.validation(
      "startElementId/endElementId must reference another element on the same page"
    ),
  locked: () =>
    AppError.validation(
      "The element is locked: only {locked:false} is accepted until it is unlocked"
    ),
};

export class UpdateBoardElement {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly scenes: IBoardScenes,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    id: string;
    patch: Record<string, unknown>;
    rebind?: RebindRefs;
  }): Promise<Result<{ id: string }, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const outcome = await this.scenes.transact(input.boardId, (scene) =>
      patchElement(
        scene,
        this.ids,
        input.id,
        stripReserved(input.patch),
        input.rebind
      )
    );
    return outcome === "ok" ? ok({ id: input.id }) : err(FAILURES[outcome]());
  }
}
