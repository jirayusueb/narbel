import type { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { toVersionDto } from "../dtos/version-dto";
import type { VersionDto } from "../dtos/version-dto";
import type { IBoardAccess } from "../ports/i-board-access";
import type { IBoardVersions } from "../ports/i-board-versions";

export class ListBoardVersions {
  constructor(
    private readonly policy: IBoardAccess,
    private readonly versions: IBoardVersions
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
  }): Promise<Result<VersionDto[], AppError>> {
    const granted = await this.policy.decide(
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
