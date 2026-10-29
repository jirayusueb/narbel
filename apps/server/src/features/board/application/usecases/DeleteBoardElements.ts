import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import type { IBoardScenes } from "../ports/IBoardScenes";

export class DeleteBoardElements {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly scenes: IBoardScenes,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    ids: string[];
  }): Promise<Result<{ deleted: number }, AppError>> {
    const granted = await this.guard.require(input.boardId, input.actor, "write");
    if (granted.isErr()) {
      return err(granted.error);
    }
    const deleted = await this.scenes.transact(input.boardId, (scene) => {
      let count = 0;
      for (const id of input.ids) {
        const found = scene.find(id);
        if (found && !found.element.isDeleted) {
          // tombstone, so concurrent edits and late joiners converge on the deletion
          scene.put(found.pageId, {
            ...found.element,
            isDeleted: true,
            version: found.element.version + 1,
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
