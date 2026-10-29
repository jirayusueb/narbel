import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { loadOwnedBoard } from "../BoardAccess";
import type { IBoardRepository } from "../ports/IBoardRepository";
import type { IBoardScenes } from "../ports/IBoardScenes";

// Identity and versioning belong to the system; a patch must not be able to rewrite them.
const RESERVED = new Set([
  "id",
  "type",
  "version",
  "versionNonce",
  "isDeleted",
  "updated",
]);

export class UpdateBoardElement {
  constructor(
    private readonly boards: IBoardRepository,
    private readonly scenes: IBoardScenes,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    userId: string;
    boardId: string;
    id: string;
    patch: Record<string, unknown>;
  }): Promise<Result<{ id: string }, AppError>> {
    const board = await loadOwnedBoard(
      this.boards,
      input.boardId,
      input.userId
    );
    if (board.isErr()) {
      return err(board.error);
    }
    const patch = Object.fromEntries(
      Object.entries(input.patch).filter(([key]) => !RESERVED.has(key))
    );
    const found = await this.scenes.transact(input.boardId, (scene) => {
      const local = scene.get(input.id);
      if (!local || local.isDeleted) {
        return false;
      }
      scene.put({
        ...local,
        ...patch,
        ...(local.type === "text" && typeof patch.text === "string"
          ? { originalText: patch.text }
          : {}),
        version: local.version + 1,
        versionNonce: this.ids.int(),
        updated: Date.now(),
      });
      return true;
    });
    return found ? ok({ id: input.id }) : err(AppError.notFound("Element"));
  }
}
