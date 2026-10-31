import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { toBoardDto } from "../dtos/BoardDto";
import type { BoardDto } from "../dtos/BoardDto";
import type { IBoardRepository } from "../ports/IBoardRepository";

export class ListTrash {
  constructor(private readonly boards: IBoardRepository) {}

  async execute(input: {
    userId: string;
  }): Promise<Result<BoardDto[], AppError>> {
    const boards = await this.boards.listTrashedByOwner(input.userId);
    return ok(boards.map((board) => toBoardDto(board, "owner")));
  }
}
