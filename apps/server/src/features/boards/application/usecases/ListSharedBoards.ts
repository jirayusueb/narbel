import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { toBoardDto } from "../dtos/BoardDto";
import type { BoardDto } from "../dtos/BoardDto";
import type { IBoardRepository } from "../ports/IBoardRepository";

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
