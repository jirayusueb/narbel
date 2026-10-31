import type { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { BoardAccessGuard } from "../BoardAccess";
import { toVersionDto } from "../dtos/VersionDto";
import type { VersionDto } from "../dtos/VersionDto";
import type { IBoardVersions } from "../ports/IBoardVersions";

export class ListBoardVersions {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly versions: IBoardVersions
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
  }): Promise<Result<VersionDto[], AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "read"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const versions = await this.versions.list(input.boardId);
    return ok(versions.map((version) => toVersionDto(version)));
  }
}
