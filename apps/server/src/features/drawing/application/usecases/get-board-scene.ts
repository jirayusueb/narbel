import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { Page } from "../../domain/entities/page";
import { Geometry } from "../../domain/rules/geometry";
import type { Bounds } from "../../domain/rules/geometry";
import { toSceneDtos } from "../dtos/scene-dto";
import type { SceneDto } from "../dtos/scene-dto";
import type { IBoardAccess } from "../ports/i-board-access";
import type { IBoardScenes } from "../ports/i-board-scenes";

export class GetBoardScene {
  constructor(
    private readonly policy: IBoardAccess,
    private readonly scenes: IBoardScenes
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    pageId?: string;
    within?: Bounds;
    types?: string[];
    limit?: number;
  }): Promise<Result<SceneDto, AppError>> {
    const granted = await this.policy.decide(
      input.boardId,
      input.actor,
      "read"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const scene = await this.scenes.transact(input.boardId, (s) => {
      const page = Page.resolve(s.pages(), input.pageId);
      if (!page) {
        return;
      }
      const all = s.all(page.id);
      const matched = toSceneDtos(
        all,
        (e) =>
          (!input.types || input.types.includes(e.type)) &&
          (!input.within ||
            Geometry.overlaps(Geometry.elementBounds(e), input.within))
      );
      return {
        pageId: page.id,
        total: matched.length,
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
