import type { IFileStorage } from "../../../../shared/application/interfaces/i-file-storage";
import type { IIdGenerator } from "../../../../shared/application/interfaces/i-id-generator";
import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { Drawing } from "../../domain/entities/drawing";
import type { Element } from "../../domain/entities/element";
import { Page } from "../../domain/entities/page";
import { Geometry } from "../../domain/rules/geometry";
import { ImageHeaderReader } from "../../domain/rules/image-header";
import { Layout } from "../../domain/rules/layout";
import { UploadRules } from "../../domain/rules/upload-rules";
import { ImageElement } from "../../domain/shapes/image-element";
import { FileKey } from "../../domain/values/file-key";
import { bumped, newIdentity } from "../connectors";
import type { IBoardAccess } from "../ports/i-board-access";
import type { IBoardFileRepository } from "../ports/i-board-file-repository";
import type { IBoardScenes, SceneAccess } from "../ports/i-board-scenes";

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

const insideFrame = (frame: Element, live: Element[]) => {
  const right = live
    .filter((e) => e.frameId === frame.id)
    .map((e) => Geometry.elementBounds(e))
    .map((b) => b.x + b.width);
  return {
    x:
      (right.length === 0 ? Number(frame.x) : Math.max(...right)) +
      Layout.FRAME_PADDING,
    y: Number(frame.y) + Layout.FRAME_PADDING,
  };
};

export class AddBoardImage {
  constructor(
    private readonly policy: IBoardAccess,
    private readonly scenes: IBoardScenes,
    private readonly files: IBoardFileRepository,
    private readonly storage: IFileStorage,
    private readonly ids: IIdGenerator
  ) {}

  private target(
    scene: SceneAccess,
    input: { pageId?: string; id?: string; frameId?: string }
  ) {
    const page = Page.resolve(scene.pages(), input.pageId);
    if (!page) {
      return "no-page";
    }
    const id = input.id ?? this.ids.generate();
    if (Drawing.isElementIdTaken(id, (key) => scene.locate(key))) {
      return "id-taken";
    }
    const frame =
      input.frameId === undefined ? null : scene.get(page.id, input.frameId);
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
    const granted = await this.policy.decide(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    if (input.bytes.length > UploadRules.MAX_INLINE_IMAGE_BYTES) {
      return err(
        AppError.payloadTooLarge("Inline image exceeds 700 KiB", {
          maxBytes: UploadRules.MAX_INLINE_IMAGE_BYTES,
        })
      );
    }
    const header = ImageHeaderReader.readImageHeader(input.bytes);
    if (!header) {
      return err(
        AppError.unsupportedMediaType("Not a PNG, JPEG, GIF, WebP or SVG image")
      );
    }
    // a few KiB can declare a huge raster; renders decode it in full
    if (
      header.size &&
      header.size.width * header.size.height > UploadRules.MAX_IMAGE_PIXELS
    ) {
      return err(
        AppError.validation(
          `Image declares ${header.size.width}x${header.size.height} pixels; the limit is ${UploadRules.MAX_IMAGE_PIXELS}`
        )
      );
    }
    const fileId = new Bun.CryptoHasher("sha1")
      .update(input.bytes)
      .digest("hex");
    const valid = UploadRules.validateUpload({
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
    // Reserve the row first: a file the cleanup job is deleting refuses here, before any byte is written.
    // The bytes are content-addressed, so rewriting them is idempotent and heals a row whose upload failed.
    const registered = await this.files.save(input.boardId, {
      id: fileId,
      mimeType: header.mimeType,
      size: input.bytes.length,
    });
    if (!registered) {
      return err(AppError.conflict("Image is being cleaned up, retry"));
    }
    await this.storage.put(
      FileKey.of(input.boardId, fileId),
      input.bytes,
      header.mimeType
    );
    const size = ImageElement.imageSize(header.size, input);
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
        const beside = Layout.besideContent(
          live.map(Geometry.elementBounds),
          Layout.CLEARANCE
        );
        const spot = frame
          ? insideFrame(frame, live)
          : { x: beside.left, y: beside.top };
        const autoPlaced = input.x === undefined || input.y === undefined;
        const x = input.x ?? spot.x;
        const y = input.y ?? spot.y;
        const grows = autoPlaced && frame?.locked !== true;
        const inFrame =
          frame &&
          (grows ||
            Geometry.overlaps(
              { ...size, x, y },
              Geometry.elementBounds(frame)
            ));
        scene.ensureFile({
          id: fileId,
          mimeType: header.mimeType,
          created: now,
        });
        scene.put(
          page.id,
          ImageElement.buildImage(
            { ...size, x, y, fileId, frameId: inFrame ? frame?.id : undefined },
            { ...newIdentity(this.ids, now), id }
          )
        );
        if (frame && grows) {
          const fitted = Geometry.union([
            Geometry.elementBounds(frame),
            Layout.wrapFrame([{ ...size, x, y }]),
          ]);
          scene.put(page.id, bumped({ ...frame, ...fitted }, this.ids));
        }
        return { id, fileId, ...size };
      }
    );
    return typeof outcome === "string" ? err(FAILURES[outcome]()) : ok(outcome);
  }
}
