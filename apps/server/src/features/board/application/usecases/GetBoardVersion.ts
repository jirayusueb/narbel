import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { BoardAccessGuard } from "../BoardAccess";
import { toVersionDto } from "../dtos/VersionDto";
import type { VersionDto } from "../dtos/VersionDto";
import type { IBoardHistory, VersionScene } from "../ports/IBoardHistory";
import type { IBoardVersions } from "../ports/IBoardVersions";

export type VersionPreview = VersionDto & VersionScene;

export class GetBoardVersion {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly versions: IBoardVersions,
    private readonly history: IBoardHistory
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    versionId: string;
  }): Promise<Result<VersionPreview, AppError>> {
    const granted = await this.guard.require(
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
