import type { IFileStorage } from "../../../../shared/application/interfaces/i-file-storage";
import type { IIdGenerator } from "../../../../shared/application/interfaces/i-id-generator";
import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import type { BoardId } from "../../../../shared/kernel/types/ids";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import type { ElementId } from "../../domain/entities/element";
import type { PageId } from "../../domain/entities/page";
import { ImageHeaderReader } from "../../domain/rules/image-header";
import { UploadRules } from "../../domain/rules/upload-rules";
import { ImageElement } from "../../domain/shapes/image-element";
import { FileKey } from "../../domain/values/file-key";
import { newIdentity } from "../connectors";
import {
  MEDIA_FAILURES,
  placeMedia,
  resolveMediaTarget,
} from "../media-target";
import type { MediaRefusal } from "../media-target";
import type { IBoardAccess } from "../ports/i-board-access";
import type { IBoardFileRepository } from "../ports/i-board-file-repository";
import type { IBoardScenes } from "../ports/i-board-scenes";

export interface AddedImage {
  id: ElementId;
  fileId: string;
  width: number;
  height: number;
}

export class AddBoardImage {
  constructor(
    private readonly policy: IBoardAccess,
    private readonly scenes: IBoardScenes,
    private readonly files: IBoardFileRepository,
    private readonly storage: IFileStorage,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: BoardId;
    pageId?: PageId;
    bytes: Uint8Array;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    id?: ElementId;
    frameId?: ElementId;
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
    const parsed = ImageHeaderReader.readImageHeader(input.bytes);
    if (parsed.isErr()) {
      return err(parsed.error);
    }
    const header = parsed.value;
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
      const resolved = resolveMediaTarget(scene, this.ids, input);
      return typeof resolved === "string" ? resolved : undefined;
    });
    if (refused) {
      return err(MEDIA_FAILURES[refused]());
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
      (scene): AddedImage | MediaRefusal => {
        const resolved = resolveMediaTarget(scene, this.ids, input);
        if (typeof resolved === "string") {
          return resolved;
        }
        scene.ensureFile({
          id: fileId,
          mimeType: header.mimeType,
          created: now,
        });
        placeMedia(scene, this.ids, resolved, { ...input, ...size }, (spot) =>
          ImageElement.buildImage(
            { ...size, ...spot, fileId },
            { ...newIdentity(this.ids, now), id: resolved.id }
          )
        );
        return { id: resolved.id, ...size, fileId };
      }
    );
    return typeof outcome === "string"
      ? err(MEDIA_FAILURES[outcome]())
      : ok(outcome);
  }
}
