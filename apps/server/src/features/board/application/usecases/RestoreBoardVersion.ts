import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import type { IBoardHistory } from "../ports/IBoardHistory";
import type { IBoardVersions } from "../ports/IBoardVersions";

export interface RestoreResult {
  /** false when the board already showed this version */
  changed: boolean;
}

export class RestoreBoardVersion {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly versions: IBoardVersions,
    private readonly history: IBoardHistory
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    versionId: string;
  }): Promise<Result<RestoreResult, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const version = await this.versions.findInBoard(
      input.boardId,
      input.versionId
    );
    if (!version) {
      return err(AppError.notFound("Version"));
    }
    const outcome = await this.history.restore(
      input.boardId,
      version.state,
      (point) =>
        this.versions.record(input.boardId, {
          kind: "pre_restore",
          ...point,
          createdById: input.actor.userId,
        })
    );
    switch (outcome.status) {
      case "restored": {
        return ok({ changed: outcome.changed });
      }
      case "unsaved": {
        return err(
          AppError.internal(
            "The version is showing on the board but could not be saved yet. It will be saved automatically; check again shortly."
          )
        );
      }
      default: {
        return err(AppError.conflict("The board is changing, try again"));
      }
    }
  }
}
