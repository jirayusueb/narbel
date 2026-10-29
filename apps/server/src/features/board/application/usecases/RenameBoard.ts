import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { BoardTitle } from "../../domain/values/BoardTitle";
import { loadOwnedBoard } from "../BoardAccess";
import { toBoardDto } from "../dtos/BoardDto";
import type { BoardDto } from "../dtos/BoardDto";
import type { IBoardRepository } from "../ports/IBoardRepository";

export class RenameBoard {
  constructor(private readonly boards: IBoardRepository) {}

  async execute(input: {
    userId: string;
    boardId: string;
    title: string;
  }): Promise<Result<BoardDto, AppError>> {
    const board = await loadOwnedBoard(
      this.boards,
      input.boardId,
      input.userId
    );
    if (board.isErr()) {
      return err(board.error);
    }
    const title = BoardTitle.create(input.title);
    if (title.isErr()) {
      return err(title.error);
    }
    const renamed = board.value.rename(title.value, new Date());
    await this.boards.save(renamed);
    return ok(toBoardDto(renamed));
  }
}
