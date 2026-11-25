import type { IFileStorage } from "../../../../shared/application/interfaces/i-file-storage";
import type { IIdGenerator } from "../../../../shared/application/interfaces/i-id-generator";
import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import type { BoardId } from "../../../../shared/kernel/types/ids";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import type { ElementId } from "../../domain/entities/element";
import type { PageId } from "../../domain/entities/page";
import { UploadRules } from "../../domain/rules/upload-rules";
import type { ArtifactFormat } from "../../domain/rules/upload-rules";
import { ArtifactElement } from "../../domain/shapes/artifact-element";
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

export interface AddedArtifact {
  id: ElementId;
  fileId: string;
  width: number;
  height: number;
}

/** Stores an HTML or Markdown file and places the iframe element that shows it. */
export class AddBoardArtifact {
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
    name: string;
    format: string;
    content: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    id?: ElementId;
    frameId?: ElementId;
  }): Promise<Result<AddedArtifact, AppError>> {
    const granted = await this.policy.decide(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const bytes = new TextEncoder().encode(input.content);
    const valid = UploadRules.validateArtifact({
      format: input.format,
      name: input.name,
      bytes,
    });
    if (valid.isErr()) {
      return err(valid.error);
    }
    const { mimeType, name } = valid.value;
    const format = input.format as ArtifactFormat;
    const fileId = new Bun.CryptoHasher("sha1").update(bytes).digest("hex");
    const refused = await this.scenes.transact(input.boardId, (scene) => {
      const resolved = resolveMediaTarget(scene, this.ids, input);
      return typeof resolved === "string" ? resolved : undefined;
    });
    if (refused) {
      return err(MEDIA_FAILURES[refused]());
    }
    // the same bytes may already be stored as an image (an svg uploaded as html); never retype that row
    const existing = await this.files.findById(input.boardId, fileId);
    if (existing && existing.mimeType !== mimeType) {
      return err(
        AppError.conflict(
          "These bytes are already stored on the board as another file type"
        )
      );
    }
    // Reserve the row first: a file the cleanup job is deleting refuses here, before any byte is written.
    const registered = await this.files.save(input.boardId, {
      id: fileId,
      mimeType,
      size: bytes.length,
    });
    if (!registered) {
      return err(AppError.conflict("Artifact is being cleaned up, retry"));
    }
    await this.storage.put(FileKey.of(input.boardId, fileId), bytes, mimeType);
    const size = {
      width: input.width ?? ArtifactElement.DEFAULT_SIZE.width,
      height: input.height ?? ArtifactElement.DEFAULT_SIZE.height,
    };
    const now = Date.now();
    const outcome = await this.scenes.transact(
      input.boardId,
      (scene): AddedArtifact | MediaRefusal => {
        const resolved = resolveMediaTarget(scene, this.ids, input);
        if (typeof resolved === "string") {
          return resolved;
        }
        // no ensureFile: the scene's files map is the image cache, and artifacts are fetched on view
        placeMedia(scene, this.ids, resolved, { ...input, ...size }, (spot) =>
          ArtifactElement.buildArtifact(
            { ...size, ...spot, fileId, format, name },
            { ...newIdentity(this.ids, now), id: resolved.id }
          )
        );
        return { id: resolved.id, fileId, ...size };
      }
    );
    return typeof outcome === "string"
      ? err(MEDIA_FAILURES[outcome]())
      : ok(outcome);
  }
}
