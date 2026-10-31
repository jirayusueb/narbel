import type { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { BoardAccessGuard } from "../BoardAccess";
import { toBoardDto } from "../dtos/BoardDto";
import type { BoardDto } from "../dtos/BoardDto";

export class GetBoard {
  constructor(private readonly guard: BoardAccessGuard) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
  }): Promise<Result<BoardDto, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "read"
    );
    return granted.isErr()
      ? err(granted.error)
      : ok(toBoardDto(granted.value.board, granted.value.access.role));
  }
}
