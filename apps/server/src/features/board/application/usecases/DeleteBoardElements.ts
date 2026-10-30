import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import { deleteElement } from "../connectors";
import type { IBoardScenes } from "../ports/IBoardScenes";

export class DeleteBoardElements {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly scenes: IBoardScenes,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    ids: string[];
  }): Promise<Result<{ deleted: number; locked?: string[] }, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const outcomes = await this.scenes.transact(input.boardId, (scene) =>
      input.ids.map((id) => ({
        id,
        outcome: deleteElement(scene, this.ids, id),
      }))
    );
    const locked = outcomes
      .filter((o) => o.outcome === "locked")
      .map((o) => o.id);
    return ok({
      deleted: outcomes.filter((o) => o.outcome === "ok").length,
      ...(locked.length > 0 ? { locked } : {}),
    });
  }
}
