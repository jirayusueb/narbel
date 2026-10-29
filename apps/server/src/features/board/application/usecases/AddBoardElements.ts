import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { buildElement } from "../../domain/shapes/ShapeRegistry";
import type { Shape } from "../../domain/shapes/ShapeRegistry";
import { loadOwnedBoard } from "../BoardAccess";
import type { IBoardRepository } from "../ports/IBoardRepository";
import type { IBoardScenes } from "../ports/IBoardScenes";

export class AddBoardElements {
  constructor(
    private readonly boards: IBoardRepository,
    private readonly scenes: IBoardScenes,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    userId: string;
    boardId: string;
    shapes: Shape[];
  }): Promise<Result<{ ids: string[] }, AppError>> {
    const board = await loadOwnedBoard(
      this.boards,
      input.boardId,
      input.userId
    );
    if (board.isErr()) {
      return err(board.error);
    }
    const now = Date.now();
    const elements = input.shapes.map((shape) =>
      buildElement(shape, {
        id: this.ids.generate(),
        seed: this.ids.int(),
        versionNonce: this.ids.int(),
        updated: now,
      })
    );
    await this.scenes.transact(input.boardId, (scene) => {
      for (const element of elements) {
        scene.put(element);
      }
    });
    return ok({ ids: elements.map((e) => e.id) });
  }
}
