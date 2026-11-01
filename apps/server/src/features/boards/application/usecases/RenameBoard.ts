import type { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { renameBoard } from "../../domain/entities/Board";
import { BoardTitle } from "../../domain/values/BoardTitle";
import type { AccessPolicy } from "../AccessPolicy";
import { toBoardDto } from "../dtos/BoardDto";
import type { BoardDto } from "../dtos/BoardDto";
import type { IBoardRepository } from "../ports/IBoardRepository";

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
    const renamed = renameBoard(granted.value.board, title.value, new Date());
    await this.boards.save(renamed);
    return ok(toBoardDto(renamed, "owner"));
  }
}
