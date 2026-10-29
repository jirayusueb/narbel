import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { boardFileKey } from "../../domain/values/FileKey";
import { loadOwnedBoard } from "../BoardAccess";
import type { IBoardFileRepository } from "../ports/IBoardFileRepository";
import type { IBoardRepository } from "../ports/IBoardRepository";
import type { IFileStorage } from "../ports/IFileStorage";

export interface BoardFileContent {
  mimeType: string;
  size: number;
  stream: ReadableStream<Uint8Array>;
}

export class GetBoardFile {
  constructor(
    private readonly boards: IBoardRepository,
    private readonly files: IBoardFileRepository,
    private readonly storage: IFileStorage
  ) {}

  async execute(input: {
    userId: string;
    boardId: string;
    fileId: string;
  }): Promise<Result<BoardFileContent, AppError>> {
    const board = await loadOwnedBoard(
      this.boards,
      input.boardId,
      input.userId
    );
    if (board.isErr()) {
      return err(board.error);
    }
    const file = await this.files.findById(input.boardId, input.fileId);
    if (!file) {
      return err(AppError.notFound("File"));
    }
    const stream = this.storage.stream(
      boardFileKey(input.boardId, input.fileId)
    );
    return ok({ mimeType: file.mimeType, size: file.size, stream });
  }
}
