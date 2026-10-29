import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { resolvePage } from "../../domain/entities/Page";
import { buildElement } from "../../domain/shapes/ShapeRegistry";
import type { Shape } from "../../domain/shapes/ShapeRegistry";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import type { IBoardScenes } from "../ports/IBoardScenes";

export class AddBoardElements {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly scenes: IBoardScenes,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    pageId?: string;
    shapes: Shape[];
  }): Promise<Result<{ ids: string[] }, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
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
    const found = await this.scenes.transact(input.boardId, (scene) => {
      const page = resolvePage(scene.pages(), input.pageId);
      if (!page) {
        return false;
      }
      for (const element of elements) {
        scene.put(page.id, element);
      }
      return true;
    });
    return found
      ? ok({ ids: elements.map((e) => e.id) })
      : err(AppError.notFound("Page"));
  }
}
