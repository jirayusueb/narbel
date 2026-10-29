import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { Board } from "../../domain/entities/Board";
import { BoardTitle } from "../../domain/values/BoardTitle";
import { toBoardDto } from "../dtos/BoardDto";
import type { BoardDto } from "../dtos/BoardDto";
import type { IBoardRepository } from "../ports/IBoardRepository";

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
