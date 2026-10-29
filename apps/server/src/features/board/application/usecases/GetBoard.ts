import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { loadOwnedBoard } from "../BoardAccess";
import { toBoardDto } from "../dtos/BoardDto";
import type { BoardDto } from "../dtos/BoardDto";
import type { IBoardRepository } from "../ports/IBoardRepository";

export class GetBoard {
  constructor(private readonly boards: IBoardRepository) {}

  async execute(input: {
    userId: string;
    boardId: string;
  }): Promise<Result<BoardDto, AppError>> {
    const board = await loadOwnedBoard(
      this.boards,
      input.boardId,
      input.userId
    );
    return board.isErr() ? err(board.error) : ok(toBoardDto(board.value));
  }
}
