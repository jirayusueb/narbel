import type { IFileStorage } from "../../../../shared/application/interfaces/i-file-storage";
import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { Page } from "../../domain/entities/page";
import type { ImageData } from "../../domain/rendering/scene-svg";
import { MAX_EXPORT_BYTES, loadBoardImages } from "../board-images";
import { toExcalidraw } from "../dtos/excalidraw-element";
import type { ExcalidrawElement } from "../dtos/excalidraw-element";
import { byZOrder } from "../dtos/scene-dto";
import type { IBoardAccess } from "../ports/i-board-access";
import type { IBoardFileRepository } from "../ports/i-board-file-repository";
import type { IBoardScenes } from "../ports/i-board-scenes";

export interface ExcalidrawFile {
  type: "excalidraw";
  version: 2;
  source: "narbel";
  elements: ExcalidrawElement[];
  appState: { viewBackgroundColor: string };
  files: Record<
    string,
    { id: string; mimeType: string; dataURL: string; created: number }
  >;
  omittedFiles: string[];
}

export class ExportBoardScene {
  constructor(
    private readonly policy: IBoardAccess,
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
    const granted = await this.policy.decide(
      input.boardId,
      input.actor,
      "read"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const elements = await this.scenes.transact(input.boardId, (s) => {
      const page = Page.resolve(s.pages(), input.pageId);
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
      elements: elements.map(toExcalidraw),
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
