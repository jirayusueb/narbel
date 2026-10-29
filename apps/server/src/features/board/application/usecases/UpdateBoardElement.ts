import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { SceneElement } from "../../domain/entities/SceneElement";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import type { IBoardScenes, SceneAccess } from "../ports/IBoardScenes";

// Identity and versioning belong to the system; a patch must not be able to rewrite them.
const RESERVED = new Set([
  "id",
  "type",
  "version",
  "versionNonce",
  "isDeleted",
  "updated",
]);

export const stripReserved = (patch: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(patch).filter(([key]) => !RESERVED.has(key))
  );

/** Writes `patch` over the element as a new version; false when it is missing or deleted. */
export const patchElement = (
  scene: SceneAccess,
  ids: IIdGenerator,
  id: string,
  patch: Record<string, unknown>
): boolean => {
  const found = scene.find(id);
  if (!found || found.element.isDeleted) {
    return false;
  }
  const local: SceneElement = found.element;
  scene.put(found.pageId, {
    ...local,
    ...patch,
    ...(local.type === "text" && typeof patch.text === "string"
      ? { originalText: patch.text }
      : {}),
    version: local.version + 1,
    versionNonce: ids.int(),
    updated: Date.now(),
  });
  return true;
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
  }): Promise<Result<{ id: string }, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const patch = stripReserved(input.patch);
    const found = await this.scenes.transact(input.boardId, (scene) =>
      patchElement(scene, this.ids, input.id, patch)
    );
    return found ? ok({ id: input.id }) : err(AppError.notFound("Element"));
  }
}
