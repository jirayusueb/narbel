import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { loadOwnedBoard } from "../BoardAccess";
import type { IBoardRepository } from "../ports/IBoardRepository";
import type { IBoardScenes } from "../ports/IBoardScenes";

export class DeleteBoardElements {
  constructor(
    private readonly boards: IBoardRepository,
    private readonly scenes: IBoardScenes,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    userId: string;
    boardId: string;
    ids: string[];
  }): Promise<Result<{ deleted: number }, AppError>> {
    const board = await loadOwnedBoard(
      this.boards,
      input.boardId,
      input.userId
    );
    if (board.isErr()) {
      return err(board.error);
    }
    const deleted = await this.scenes.transact(input.boardId, (scene) => {
      let count = 0;
      for (const id of input.ids) {
        const local = scene.get(id);
        if (local && !local.isDeleted) {
          // tombstone, so concurrent edits and late joiners converge on the deletion
          scene.put({
            ...local,
            isDeleted: true,
            version: local.version + 1,
            versionNonce: this.ids.int(),
            updated: Date.now(),
          });
          count += 1;
        }
      }
      return count;
    });
    return ok({ deleted });
  }
}
