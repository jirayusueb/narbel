import type { ICache } from "../../../../shared/application/interfaces/ICache";
import type { IFileStorage } from "../../../../shared/application/interfaces/IFileStorage";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { resolvePage } from "../../domain/entities/Page";
import { buildSceneSvg } from "../../domain/rendering/sceneSvg";
import type { Bounds } from "../../domain/rules/geometry";
import type { AccessPolicy } from "../AccessPolicy";
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

const CACHE_TTL_SECONDS = 600;

type CachedBoardImage = Omit<BoardImage, "image"> & {
  image:
    | (Omit<NonNullable<BoardImage["image"]>, "png"> & { png: string })
    | null;
};

export class RenderBoardImage {
  constructor(
    private readonly policy: AccessPolicy,
    private readonly scenes: IBoardScenes,
    private readonly files: IBoardFileRepository,
    private readonly storage: IFileStorage,
    private readonly rasterizer: IBoardRasterizer,
    private readonly cache: ICache
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    pageId?: string;
    maxSize?: number;
  }): Promise<Result<BoardImage, AppError>> {
    const granted = await this.policy.decide(
      input.boardId,
      input.actor,
      "read"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    // keyed by the board's last save, never by a caller-supplied version, so ?v= cannot force re-renders
    const key = `board-image:${input.boardId}:${granted.value.board.updatedAt.getTime()}:${input.pageId ?? ""}:${input.maxSize ?? ""}`;
    const hit = await this.cache.get<CachedBoardImage>(key);
    if (hit) {
      return ok({
        ...hit,
        image: hit.image && {
          ...hit.image,
          png: Buffer.from(hit.image.png, "base64"),
        },
      });
    }
    const rendered = await this.render(input);
    if (rendered.isOk()) {
      const { image } = rendered.value;
      await this.cache.set(
        key,
        {
          ...rendered.value,
          image: image && {
            ...image,
            png: Buffer.from(image.png).toString("base64"),
          },
        } satisfies CachedBoardImage,
        CACHE_TTL_SECONDS
      );
    }
    return rendered;
  }

  private async render(input: {
    boardId: string;
    pageId?: string;
    maxSize?: number;
  }): Promise<Result<BoardImage, AppError>> {
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
      MAX_RENDER_BYTES,
      true
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
      omittedFiles: [...omitted, ...(scene?.overBudgetFiles ?? [])],
    });
  }
}
