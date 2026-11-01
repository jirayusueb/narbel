import type { IFileStorage } from "../../../../shared/application/interfaces/i-file-storage";
import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { UploadRules } from "../../domain/rules/upload-rules";
import { FileKey } from "../../domain/values/file-key";
import type { IBoardAccess } from "../ports/i-board-access";
import type { IBoardFileRepository } from "../ports/i-board-file-repository";

const PRESIGN_SECONDS = 5 * 60;

export class PresignBoardFileUpload {
  constructor(
    private readonly policy: IBoardAccess,
    private readonly files: IBoardFileRepository,
    private readonly storage: IFileStorage
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    fileId: string;
    mimeType: string;
    size: number;
  }): Promise<Result<{ fileId: string; uploadUrl: string }, AppError>> {
    const granted = await this.policy.decide(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const valid = UploadRules.validateUpload(input);
    if (valid.isErr()) {
      return err(valid.error);
    }
    const existing = await this.files.findById(input.boardId, input.fileId);
    if (existing && existing.mimeType !== input.mimeType) {
      return err(AppError.conflict("fileId already used with another type"));
    }
    // idempotent: a retry after a failed PUT gets a fresh URL for the same file
    const registered = await this.files.save(input.boardId, {
      id: input.fileId,
      mimeType: input.mimeType,
      size: input.size,
    });
    if (!registered) {
      return err(AppError.conflict("fileId is being cleaned up, retry"));
    }
    return ok({
      fileId: input.fileId,
      uploadUrl: this.storage.presignUpload(
        FileKey.of(input.boardId, input.fileId),
        input.mimeType,
        PRESIGN_SECONDS
      ),
    });
  }
}
