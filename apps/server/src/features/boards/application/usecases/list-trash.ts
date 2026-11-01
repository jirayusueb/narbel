import type { AppError } from "../../../../shared/kernel/errors/app-error";
import { ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { toBoardDto } from "../dtos/board-dto";
import type { BoardDto } from "../dtos/board-dto";
import type { IBoardRepository } from "../ports/i-board-repository";

export class ListTrash {
  constructor(private readonly boards: IBoardRepository) {}

  async execute(input: {
    userId: string;
  }): Promise<Result<BoardDto[], AppError>> {
    const boards = await this.boards.listTrashedByOwner(input.userId);
    return ok(boards.map((board) => toBoardDto(board, "owner")));
  }
}
