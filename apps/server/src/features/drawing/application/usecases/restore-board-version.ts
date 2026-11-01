import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import type { BoardId } from "../../../../shared/kernel/types/ids";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import type { IBoardAccess } from "../ports/i-board-access";
import type { IBoardHistory } from "../ports/i-board-history";
import type { IBoardVersions } from "../ports/i-board-versions";

export interface RestoreResult {
  /** false when the board already showed this version */
  changed: boolean;
}

export class RestoreBoardVersion {
  constructor(
    private readonly policy: IBoardAccess,
    private readonly versions: IBoardVersions,
    private readonly history: IBoardHistory
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: BoardId;
    versionId: string;
  }): Promise<Result<RestoreResult, AppError>> {
    const granted = await this.policy.decide(
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
