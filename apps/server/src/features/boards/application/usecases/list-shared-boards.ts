import type { AppError } from "../../../../shared/kernel/errors/app-error";
import { ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { toBoardDto } from "../dtos/board-dto";
import type { BoardDto } from "../dtos/board-dto";
import type { IBoardRepository } from "../ports/i-board-repository";

export class ListSharedBoards {
  constructor(private readonly boards: IBoardRepository) {}

  async execute(input: {
    userId: string;
    email: string;
  }): Promise<Result<BoardDto[], AppError>> {
    const shared = await this.boards.listSharedWith(input.userId, input.email);
    return ok(shared.map(({ board, role }) => toBoardDto(board, role)));
  }
}
