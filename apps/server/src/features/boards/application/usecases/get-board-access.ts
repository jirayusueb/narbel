import type { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import type { AccessPolicy } from "../access-policy";
import { toAccessDto } from "../dtos/access-dto";
import type { BoardAccessDto } from "../dtos/access-dto";
import type { IBoardAccessRepository } from "../ports/i-board-access-repository";

export class GetBoardAccess {
  constructor(
    private readonly policy: AccessPolicy,
    private readonly grants: IBoardAccessRepository,
    private readonly webOrigin: string
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
  }): Promise<Result<BoardAccessDto, AppError>> {
    const granted = await this.policy.decide(
      input.boardId,
      input.actor,
      "owner"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const [share, members] = await Promise.all([
      this.grants.findShare(input.boardId),
      this.grants.listMembers(input.boardId),
    ]);
    return ok(toAccessDto(granted.value.board, share, members, this.webOrigin));
  }
}
