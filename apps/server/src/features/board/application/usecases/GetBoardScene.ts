import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { resolvePage } from "../../domain/entities/Page";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import { toSceneElementDto } from "../dtos/SceneDto";
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
      return (
        page && {
          pageId: page.id,
          elements: s
            .all(page.id)
            .filter((e) => !e.isDeleted)
            .map(toSceneElementDto),
        }
      );
    });
    return scene
      ? ok({ title: granted.value.board.title.value, ...scene })
      : err(AppError.notFound("Page"));
  }
}
