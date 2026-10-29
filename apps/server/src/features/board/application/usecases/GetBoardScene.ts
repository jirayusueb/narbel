import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { loadOwnedBoard } from "../BoardAccess";
import type { SceneDto } from "../dtos/SceneDto";
import type { IBoardRepository } from "../ports/IBoardRepository";
import type { IBoardScenes } from "../ports/IBoardScenes";

export class GetBoardScene {
  constructor(
    private readonly boards: IBoardRepository,
    private readonly scenes: IBoardScenes
  ) {}

  async execute(input: {
    userId: string;
    boardId: string;
  }): Promise<Result<SceneDto, AppError>> {
    const board = await loadOwnedBoard(
      this.boards,
      input.boardId,
      input.userId
    );
    if (board.isErr()) {
      return err(board.error);
    }
    const elements = await this.scenes.transact(input.boardId, (scene) =>
      scene
        .all()
        .filter((e) => !e.isDeleted)
        .map((e) => ({
          id: e.id,
          type: e.type,
          x: e.x,
          y: e.y,
          width: e.width,
          height: e.height,
          ...(e.type === "text" ? { text: e.text } : {}),
          strokeColor: e.strokeColor,
          backgroundColor: e.backgroundColor,
        }))
    );
    return ok({ title: board.value.title.value, elements });
  }
}
