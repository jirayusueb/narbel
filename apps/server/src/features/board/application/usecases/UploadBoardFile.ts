import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { validateUpload } from "../../domain/rules/UploadRules";
import { boardFileKey } from "../../domain/values/FileKey";
import { loadOwnedBoard } from "../BoardAccess";
import type { BoardFileDto } from "../dtos/BoardFileDto";
import type { IBoardFileRepository } from "../ports/IBoardFileRepository";
import type { IBoardRepository } from "../ports/IBoardRepository";
import type { IFileStorage } from "../ports/IFileStorage";

export class UploadBoardFile {
  constructor(
    private readonly boards: IBoardRepository,
    private readonly files: IBoardFileRepository,
    private readonly storage: IFileStorage
  ) {}

  async execute(input: {
    userId: string;
    boardId: string;
    fileId: string;
    mimeType: string;
    size: number;
    read: () => Promise<Uint8Array>;
  }): Promise<Result<BoardFileDto, AppError>> {
    const board = await loadOwnedBoard(
      this.boards,
      input.boardId,
      input.userId
    );
    if (board.isErr()) {
      return err(board.error);
    }
    const valid = validateUpload(input);
    if (valid.isErr()) {
      return err(valid.error);
    }
    const existing = await this.files.findById(input.boardId, input.fileId);
    if (existing) {
      return ok(existing);
    }
    const bytes = await input.read();
    await this.storage.put(
      boardFileKey(input.boardId, input.fileId),
      bytes,
      input.mimeType
    );
    const file = {
      id: input.fileId,
      mimeType: input.mimeType,
      size: bytes.byteLength,
    };
    await this.files.save(input.boardId, file);
    return ok(file);
  }
}
