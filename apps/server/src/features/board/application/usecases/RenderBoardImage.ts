import type { IFileStorage } from "../../../../shared/application/interfaces/IFileStorage";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { resolvePage } from "../../domain/entities/Page";
import { buildSceneSvg } from "../../domain/rendering/sceneSvg";
import type { Bounds } from "../../domain/rules/geometry";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import { MAX_RENDER_BYTES, loadBoardImages } from "../boardImages";
import type { IBoardFileRepository } from "../ports/IBoardFileRepository";
import type { IBoardRasterizer } from "../ports/IBoardRasterizer";
import type { IBoardScenes } from "../ports/IBoardScenes";

export interface BoardImage {
  pageId: string;
  pageName: string;
  /** null when the page has nothing to draw */
  image: {
    png: Uint8Array;
    width: number;
    height: number;
    /** content bounds in board coordinates, so a picture can be related to get_board */
    bounds: Bounds;
  } | null;
  /** stored images left out of the picture (over the pixel limit, unreadable or missing) */
  omittedFiles: string[];
}

export class RenderBoardImage {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly scenes: IBoardScenes,
    private readonly files: IBoardFileRepository,
    private readonly storage: IFileStorage,
    private readonly rasterizer: IBoardRasterizer
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    pageId?: string;
    maxSize?: number;
  }): Promise<Result<BoardImage, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "read"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const page = await this.scenes.transact(input.boardId, (s) => {
      const found = resolvePage(s.pages(), input.pageId);
      return found && { ...found, elements: s.all(found.id) };
    });
    if (!page) {
      return err(AppError.notFound("Page"));
    }
    const { images, omitted } = await loadBoardImages(
      this.files,
      this.storage,
      input.boardId,
      page.elements.flatMap((e) =>
        e.type === "image" && !e.isDeleted && typeof e.fileId === "string"
          ? [e.fileId]
          : []
      ),
      MAX_RENDER_BYTES
    );
    const scene = buildSceneSvg(page.elements, images, input.maxSize);
    const image = scene && {
      png: await this.rasterizer.rasterize(scene.svg),
      width: scene.width,
      height: scene.height,
      bounds: scene.bounds,
    };
    return ok({
      pageId: page.id,
      pageName: page.name,
      image,
      omittedFiles: omitted,
    });
  }
}
