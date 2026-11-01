import type { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import type { AccessPolicy } from "../access-policy";
import { toBoardDto } from "../dtos/board-dto";
import type { BoardDto } from "../dtos/board-dto";

export class GetBoard {
  constructor(private readonly policy: AccessPolicy) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
  }): Promise<Result<BoardDto, AppError>> {
    const granted = await this.policy.decide(
      input.boardId,
      input.actor,
      "read"
    );
    return granted.isErr()
      ? err(granted.error)
      : ok(toBoardDto(granted.value.board, granted.value.access.role));
  }
}
