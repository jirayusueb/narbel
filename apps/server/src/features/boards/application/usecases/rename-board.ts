import type { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { BoardTitle } from "../../domain/values/board-title";
import type { AccessPolicy } from "../access-policy";
import { toBoardDto } from "../dtos/board-dto";
import type { BoardDto } from "../dtos/board-dto";
import type { IBoardRepository } from "../ports/i-board-repository";

export class RenameBoard {
  constructor(
    private readonly policy: AccessPolicy,
    private readonly boards: IBoardRepository
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    title: string;
  }): Promise<Result<BoardDto, AppError>> {
    const granted = await this.policy.decide(
      input.boardId,
      input.actor,
      "owner"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const title = BoardTitle.create(input.title);
    if (title.isErr()) {
      return err(title.error);
    }
    const renamed = granted.value.board.rename(title.value, new Date());
    await this.boards.save(renamed);
    return ok(toBoardDto(renamed, "owner"));
  }
}
