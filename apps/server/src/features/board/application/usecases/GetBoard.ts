import type { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { AccessPolicy } from "../AccessPolicy";
import { toBoardDto } from "../dtos/BoardDto";
import type { BoardDto } from "../dtos/BoardDto";

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
