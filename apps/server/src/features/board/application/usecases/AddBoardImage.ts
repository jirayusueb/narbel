import type { IFileStorage } from "../../../../shared/application/interfaces/IFileStorage";
import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { resolvePage } from "../../domain/entities/Page";
import type { SceneElement } from "../../domain/entities/SceneElement";
import { elementBounds, union } from "../../domain/rules/geometry";
import { readImageHeader } from "../../domain/rules/imageHeader";
import { FRAME_PADDING, wrapFrame } from "../../domain/rules/layout";
import {
  MAX_INLINE_IMAGE_BYTES,
  validateUpload,
} from "../../domain/rules/UploadRules";
import { buildImage, imageSize } from "../../domain/shapes/imageElement";
import { boardFileKey } from "../../domain/values/FileKey";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import { bumped, newIdentity } from "../connectors";
import type { IBoardFileRepository } from "../ports/IBoardFileRepository";
import type { IBoardScenes } from "../ports/IBoardScenes";

// keeps an image placed without x/y clear of what is already on the page
const CLEARANCE = 120;

export interface AddedImage {
  id: string;
  fileId: string;
  width: number;
  height: number;
}

type Outcome = AddedImage | "no-page" | "id-taken" | "no-frame";

const FAILURES: Record<Exclude<Outcome, AddedImage>, () => AppError> = {
  "no-page": () => AppError.notFound("Page"),
  "id-taken": () =>
    AppError.validation("An element with that id already exists on the board"),
  "no-frame": () =>
    AppError.validation("frameId must reference a frame on the page"),
};

const besideAll = (live: SceneElement[]) => ({
  x:
    live.length === 0
      ? 0
      : Math.max(...live.map((e) => Number(e.x) + Number(e.width))) + CLEARANCE,
  y: live.length === 0 ? 0 : Math.min(...live.map((e) => Number(e.y))),
});
/** Inside the frame at its padding, right of what its children already fill. */
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
    // content-addressed like Excalidraw's own ids: the same bytes always land on one object
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
    const size = imageSize(header.size, input);
    const now = Date.now();
    const outcome = await this.scenes.transact(
      input.boardId,
      (scene): Outcome => {
        const page = resolvePage(scene.pages(), input.pageId);
        if (!page) {
          return "no-page";
        }
        const id = input.id ?? this.ids.generate();
        // SceneAccess.find looks up by id on any page; it is not Array#find
        const taken = scene.find(id);
        if (taken) {
          return "id-taken";
        }
        const frame =
          input.frameId === undefined
            ? undefined
            : scene.get(page.id, input.frameId);
        if (input.frameId !== undefined && frame?.type !== "frame") {
          return "no-frame";
        }
        const live = scene.all(page.id).filter((e) => !e.isDeleted);
        const spot = frame ? insideFrame(frame, live) : besideAll(live);
        const x = input.x ?? spot.x;
        const y = input.y ?? spot.y;
        scene.putFile({ id: fileId, mimeType: header.mimeType, created: now });
        scene.put(
          page.id,
          buildImage(
            { ...size, x, y, fileId, frameId: input.frameId },
            { ...newIdentity(this.ids, now), id }
          )
        );
        // a frame only ever grows around an image the server placed itself
        if (frame && (input.x === undefined || input.y === undefined)) {
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
