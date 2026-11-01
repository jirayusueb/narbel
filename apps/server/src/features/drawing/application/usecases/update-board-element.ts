import type { IIdGenerator } from "../../../../shared/application/interfaces/i-id-generator";
import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import type { BoardId } from "../../../../shared/kernel/types/ids";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import type { ElementId } from "../../domain/entities/element";
import { patchElement, stripReserved } from "../connectors";
import type { PatchOutcome, RebindRefs } from "../connectors";
import type { IBoardAccess } from "../ports/i-board-access";
import type { IBoardScenes } from "../ports/i-board-scenes";

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
    private readonly policy: IBoardAccess,
    private readonly scenes: IBoardScenes,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: BoardId;
    id: ElementId;
    patch: Record<string, unknown>;
    rebind?: RebindRefs;
  }): Promise<Result<{ id: ElementId }, AppError>> {
    const granted = await this.policy.decide(
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
