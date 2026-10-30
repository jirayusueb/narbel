import type { IFileStorage } from "../../../../shared/application/interfaces/IFileStorage";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { resolvePage } from "../../domain/entities/Page";
import { buildSceneSvg } from "../../domain/rendering/sceneSvg";
import type { Bounds, ImageData } from "../../domain/rendering/sceneSvg";
import { boardFileKey } from "../../domain/values/FileKey";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import type { IBoardFileRepository } from "../ports/IBoardFileRepository";
import type { IBoardRasterizer } from "../ports/IBoardRasterizer";
import type { IBoardScenes } from "../ports/IBoardScenes";

// One render holds every embedded image in memory as base64; past this the rest draw as placeholders.
const MAX_EMBEDDED_BYTES = 32 * 1024 * 1024;

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
    const images = await this.loadImages(
      input.boardId,
      page.elements.flatMap((e) =>
        e.type === "image" && !e.isDeleted && typeof e.fileId === "string"
          ? [e.fileId]
          : []
      )
    );
    const scene = buildSceneSvg(page.elements, images, input.maxSize);
    const image = scene && {
      png: await this.rasterizer.rasterize(scene.svg),
      width: scene.width,
      height: scene.height,
      bounds: scene.bounds,
    };
    return ok({ pageId: page.id, pageName: page.name, image });
  }

  /** Files that are unknown, gone from storage, or past the byte budget are left out; the renderer draws a placeholder. */
  private async loadImages(boardId: string, fileIds: string[]) {
    const found = await Promise.all(
      [...new Set(fileIds)].map(async (fileId) => {
        const file = await this.files.findById(boardId, fileId);
        const key = boardFileKey(boardId, fileId);
        // The presigned PUT does not bind the declared size, so budget on what storage holds.
        const stored = file && (await this.storage.stat(key));
        return file && stored
          ? { fileId, key, mimeType: file.mimeType, size: stored.size }
          : null;
      })
    );
    let budget = MAX_EMBEDDED_BYTES;
    const chosen = found.filter((f) => {
      if (!f || f.size > budget) {
        return false;
      }
      budget -= f.size;
      return true;
    });
    const images = new Map<string, ImageData>();
    await Promise.all(
      chosen.map(async (f) => {
        if (!f) {
          return;
        }
        const bytes = await new Response(this.storage.stream(f.key)).bytes();
        images.set(f.fileId, {
          mimeType: f.mimeType,
          base64: Buffer.from(bytes).toString("base64"),
        });
      })
    );
    return images;
  }
}
