import type { IFileStorage } from "../../../../shared/application/interfaces/IFileStorage";
import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { resolvePage } from "../../domain/entities/Page";
import type { SceneElement } from "../../domain/entities/SceneElement";
import { elementBounds, overlaps, union } from "../../domain/rules/geometry";
import { readImageHeader } from "../../domain/rules/imageHeader";
import {
  CLEARANCE,
  FRAME_PADDING,
  besideContent,
  wrapFrame,
} from "../../domain/rules/layout";
import {
  MAX_IMAGE_PIXELS,
  MAX_INLINE_IMAGE_BYTES,
  validateUpload,
} from "../../domain/rules/UploadRules";
import { buildImage, imageSize } from "../../domain/shapes/imageElement";
import { boardFileKey } from "../../domain/values/FileKey";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import { bumped, newIdentity } from "../connectors";
import type { IBoardFileRepository } from "../ports/IBoardFileRepository";
import type { IBoardScenes, SceneAccess } from "../ports/IBoardScenes";

export interface AddedImage {
  id: string;
  fileId: string;
  width: number;
  height: number;
}

type Refusal = "no-page" | "id-taken" | "no-frame";

const FAILURES: Record<Refusal, () => AppError> = {
  "no-page": () => AppError.notFound("Page"),
  "id-taken": () =>
    AppError.validation("An element with that id already exists on the board"),
  "no-frame": () =>
    AppError.validation("frameId must reference a frame on the page"),
};

const insideFrame = (frame: SceneElement, live: SceneElement[]) => {
  const right = live
    .filter((e) => e.frameId === frame.id)
    .map((e) => elementBounds(e))
    .map((b) => b.x + b.width);
  return {
    x:
      (right.length === 0 ? Number(frame.x) : Math.max(...right)) +
      FRAME_PADDING,
    y: Number(frame.y) + FRAME_PADDING,
  };
};

export class AddBoardImage {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly scenes: IBoardScenes,
    private readonly files: IBoardFileRepository,
    private readonly storage: IFileStorage,
    private readonly ids: IIdGenerator
  ) {}

  private target(
    scene: SceneAccess,
    input: { pageId?: string; id?: string; frameId?: string }
  ) {
    const page = resolvePage(scene.pages(), input.pageId);
    if (!page) {
      return "no-page";
    }
    const id = input.id ?? this.ids.generate();
    const taken = scene.locate(id);
    if (taken) {
      return "id-taken";
    }
    const frame =
      input.frameId === undefined
        ? undefined
        : scene.get(page.id, input.frameId);
    if (
      input.frameId !== undefined &&
      (frame?.type !== "frame" || frame.isDeleted)
    ) {
      return "no-frame";
    }
    return { page, id, frame };
  }

  async execute(input: {
    actor: Actor;
    boardId: string;
    pageId?: string;
    bytes: Uint8Array;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    id?: string;
    frameId?: string;
  }): Promise<Result<AddedImage, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    if (input.bytes.length > MAX_INLINE_IMAGE_BYTES) {
      return err(
        AppError.payloadTooLarge("Inline image exceeds 700 KiB", {
          maxBytes: MAX_INLINE_IMAGE_BYTES,
        })
      );
    }
    const header = readImageHeader(input.bytes);
    if (!header) {
      return err(
        AppError.unsupportedMediaType("Not a PNG, JPEG, GIF, WebP or SVG image")
      );
    }
    // a few KiB can declare a huge raster; renders decode it in full
    if (
      header.size &&
      header.size.width * header.size.height > MAX_IMAGE_PIXELS
    ) {
      return err(
        AppError.validation(
          `Image declares ${header.size.width}x${header.size.height} pixels; the limit is ${MAX_IMAGE_PIXELS}`
        )
      );
    }
    const fileId = new Bun.CryptoHasher("sha1")
      .update(input.bytes)
      .digest("hex");
    const valid = validateUpload({
      fileId,
      mimeType: header.mimeType,
      size: input.bytes.length,
    });
    if (valid.isErr()) {
      return err(valid.error);
    }
    const refused = await this.scenes.transact(input.boardId, (scene) => {
      const resolved = this.target(scene, input);
      return typeof resolved === "string" ? resolved : undefined;
    });
    if (refused) {
      return err(FAILURES[refused]());
    }
    if (!(await this.files.findById(input.boardId, fileId))) {
      await this.storage.put(
        boardFileKey(input.boardId, fileId),
        input.bytes,
        header.mimeType
      );
      await this.files.save(input.boardId, {
        id: fileId,
        mimeType: header.mimeType,
        size: input.bytes.length,
      });
    }
    const size = imageSize(header.size, input);
    const now = Date.now();
    const outcome = await this.scenes.transact(
      input.boardId,
      (scene): AddedImage | Refusal => {
        const resolved = this.target(scene, input);
        if (typeof resolved === "string") {
          return resolved;
        }
        const { page, id, frame } = resolved;
        const live = scene.all(page.id).filter((e) => !e.isDeleted);
        const beside = besideContent(live.map(elementBounds), CLEARANCE);
        const spot = frame
          ? insideFrame(frame, live)
          : { x: beside.left, y: beside.top };
        const autoPlaced = input.x === undefined || input.y === undefined;
        const x = input.x ?? spot.x;
        const y = input.y ?? spot.y;
        const grows = autoPlaced && frame?.locked !== true;
        const inFrame =
          frame !== undefined &&
          (grows || overlaps({ ...size, x, y }, elementBounds(frame)));
        scene.ensureFile({
          id: fileId,
          mimeType: header.mimeType,
          created: now,
        });
        scene.put(
          page.id,
          buildImage(
            { ...size, x, y, fileId, frameId: inFrame ? frame?.id : undefined },
            { ...newIdentity(this.ids, now), id }
          )
        );
        if (frame && grows) {
          const fitted = union([
            elementBounds(frame),
            wrapFrame([{ ...size, x, y }]),
          ]);
          scene.put(page.id, bumped({ ...frame, ...fitted }, this.ids));
        }
        return { id, fileId, ...size };
      }
    );
    return typeof outcome === "string" ? err(FAILURES[outcome]()) : ok(outcome);
  }
}
