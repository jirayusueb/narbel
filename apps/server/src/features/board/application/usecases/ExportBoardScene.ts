import type { IFileStorage } from "../../../../shared/application/interfaces/IFileStorage";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { resolvePage } from "../../domain/entities/Page";
import type { SceneElement } from "../../domain/entities/SceneElement";
import type { ImageData } from "../../domain/rendering/sceneSvg";
import type { BoardAccessGuard } from "../BoardAccess";
import { MAX_EXPORT_BYTES, loadBoardImages } from "../boardImages";
import { byZOrder } from "../dtos/SceneDto";
import type { IBoardFileRepository } from "../ports/IBoardFileRepository";
import type { IBoardScenes } from "../ports/IBoardScenes";

export interface ExcalidrawFile {
  type: "excalidraw";
  version: 2;
  source: "narbel";
  elements: SceneElement[];
  appState: { viewBackgroundColor: string };
  files: Record<
    string,
    { id: string; mimeType: string; dataURL: string; created: number }
  >;
  omittedFiles: string[];
}

export class ExportBoardScene {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly scenes: IBoardScenes,
    private readonly files: IBoardFileRepository,
    private readonly storage: IFileStorage
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    pageId?: string;
    includeFiles?: boolean;
  }): Promise<Result<ExcalidrawFile, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "read"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const elements = await this.scenes.transact(input.boardId, (s) => {
      const page = resolvePage(s.pages(), input.pageId);
      return page && s.all(page.id).filter((e) => !e.isDeleted);
    });
    if (!elements) {
      return err(AppError.notFound("Page"));
    }
    elements.sort(byZOrder);
    const { images, omitted } = input.includeFiles
      ? await loadBoardImages(
          this.files,
          this.storage,
          input.boardId,
          elements.flatMap((e) =>
            e.type === "image" && typeof e.fileId === "string" ? [e.fileId] : []
          ),
          MAX_EXPORT_BYTES
        )
      : { images: new Map<string, ImageData>(), omitted: [] };
    const created = Date.now();
    return ok({
      type: "excalidraw",
      version: 2,
      source: "narbel",
      elements,
      appState: { viewBackgroundColor: "#ffffff" },
      files: Object.fromEntries(
        [...images].map(([id, image]) => [
          id,
          {
            id,
            mimeType: image.mimeType,
            dataURL: `data:${image.mimeType};base64,${image.base64}`,
            created,
          },
        ])
      ),
      omittedFiles: omitted,
    });
  }
}
