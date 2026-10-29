import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import { toAccessDto } from "../dtos/AccessDto";
import type { BoardAccessDto } from "../dtos/AccessDto";
import type { IBoardAccessRepository } from "../ports/IBoardAccessRepository";

export class GetBoardAccess {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly grants: IBoardAccessRepository,
    private readonly webOrigin: string
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
  }): Promise<Result<BoardAccessDto, AppError>> {
    const granted = await this.guard.require(
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
