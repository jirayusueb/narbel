import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import type { BoardId } from "../../../../shared/kernel/types/ids";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { toVersionDto } from "../dtos/version-dto";
import type { VersionDto } from "../dtos/version-dto";
import type { IBoardAccess } from "../ports/i-board-access";
import type { IBoardHistory, VersionScene } from "../ports/i-board-history";
import type { IBoardVersions } from "../ports/i-board-versions";

export type VersionPreview = VersionDto & VersionScene;

export class GetBoardVersion {
  constructor(
    private readonly policy: IBoardAccess,
    private readonly versions: IBoardVersions,
    private readonly history: IBoardHistory
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: BoardId;
    versionId: string;
  }): Promise<Result<VersionPreview, AppError>> {
    const granted = await this.policy.decide(
      input.boardId,
      input.actor,
      "read"
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
    return ok({
      ...toVersionDto(version),
      ...this.history.read(version.state),
    });
  }
}
