import { AppError } from "../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../shared/kernel/types/Result";
import type { Result } from "../../../shared/kernel/types/Result";
import type { Board } from "../domain/entities/Board";
import type { IBoardRepository } from "./ports/IBoardRepository";

// Non-owners get the same NotFound as a missing board so existence never leaks.
export async function loadOwnedBoard(
  boards: IBoardRepository,
  boardId: string,
  userId: string
): Promise<Result<Board, AppError>> {
  const board = await boards.findById(boardId);
  if (!board?.isOwnedBy(userId)) {
    return err(AppError.notFound("Board"));
  }
  return ok(board);
}
