import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { validateUpload } from "../../domain/rules/UploadRules";
import { boardFileKey } from "../../domain/values/FileKey";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import type { IBoardFileRepository } from "../ports/IBoardFileRepository";
import type { IFileStorage } from "../ports/IFileStorage";

const PRESIGN_SECONDS = 5 * 60;

export class PresignBoardFileUpload {
  constructor(
    private readonly guard: BoardAccessGuard,
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
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const valid = validateUpload(input);
    if (valid.isErr()) {
      return err(valid.error);
    }
    const existing = await this.files.findById(input.boardId, input.fileId);
    if (existing && existing.mimeType !== input.mimeType) {
      return err(AppError.conflict("fileId already used with another type"));
    }
    // idempotent: a retry after a failed PUT gets a fresh URL for the same file
    await this.files.save(input.boardId, {
      id: input.fileId,
      mimeType: input.mimeType,
      size: input.size,
    });
    return ok({
      fileId: input.fileId,
      uploadUrl: this.storage.presignUpload(
        boardFileKey(input.boardId, input.fileId),
        input.mimeType,
        PRESIGN_SECONDS
      ),
    });
  }
}
