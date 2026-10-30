import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { resolvePage } from "../../domain/entities/Page";
import { elementBounds, overlaps } from "../../domain/rules/geometry";
import type { Bounds } from "../../domain/rules/geometry";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import { countVisible, toSceneDtos } from "../dtos/SceneDto";
import type { SceneDto } from "../dtos/SceneDto";
import type { IBoardScenes } from "../ports/IBoardScenes";

export class GetBoardScene {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly scenes: IBoardScenes
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    pageId?: string;
    /** only elements whose drawn bounds overlap this box */
    within?: Bounds;
    types?: string[];
    limit?: number;
  }): Promise<Result<SceneDto, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "read"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const scene = await this.scenes.transact(input.boardId, (s) => {
      const page = resolvePage(s.pages(), input.pageId);
      if (!page) {
        return;
      }
      const all = s.all(page.id);
      const matched = toSceneDtos(
        all,
        (e) =>
          (!input.types || input.types.includes(e.type)) &&
          (!input.within || overlaps(elementBounds(e), input.within))
      );
      return {
        pageId: page.id,
        total: countVisible(all),
        truncated: input.limit !== undefined && matched.length > input.limit,
        elements:
          input.limit === undefined ? matched : matched.slice(0, input.limit),
      };
    });
    return scene
      ? ok({ title: granted.value.board.title.value, ...scene })
      : err(AppError.notFound("Page"));
  }
}
