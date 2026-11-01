import type { IFileStorage } from "../../../../shared/application/interfaces/i-file-storage";
import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import type { BoardId } from "../../../../shared/kernel/types/ids";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { FileKey } from "../../domain/values/file-key";
import type { IBoardAccess } from "../ports/i-board-access";
import type { IBoardFileRepository } from "../ports/i-board-file-repository";

export interface BoardFileContent {
  mimeType: string;
  stream: ReadableStream<Uint8Array>;
}

export class GetBoardFile {
  constructor(
    private readonly policy: IBoardAccess,
    private readonly files: IBoardFileRepository,
    private readonly storage: IFileStorage
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: BoardId;
    fileId: string;
  }): Promise<Result<BoardFileContent, AppError>> {
    const granted = await this.policy.decide(
      input.boardId,
      input.actor,
      "read"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const file = await this.files.findById(input.boardId, input.fileId);
    if (!file) {
      return err(AppError.notFound("File"));
    }
    const stream = this.storage.stream(FileKey.of(input.boardId, input.fileId));
    return ok({ mimeType: file.mimeType, stream });
  }
}
