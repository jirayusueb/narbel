import type { IIdGenerator } from "../../../../shared/application/interfaces/i-id-generator";
import type { AppError } from "../../../../shared/kernel/errors/app-error";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { Board } from "../../domain/entities/board";
import { BoardTitle } from "../../domain/values/board-title";
import { toBoardDto } from "../dtos/board-dto";
import type { BoardDto } from "../dtos/board-dto";
import type { IBoardRepository } from "../ports/i-board-repository";

export class CreateBoard {
  constructor(
    private readonly boards: IBoardRepository,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    userId: string;
    title: string;
  }): Promise<Result<BoardDto, AppError>> {
    const title = BoardTitle.create(input.title);
    if (title.isErr()) {
      return err(title.error);
    }
    const board = Board.create(
      this.ids.generate(),
      input.userId,
      title.value,
      new Date()
    );
    await this.boards.save(board);
    return ok(toBoardDto(board, "owner"));
  }
}
