import type { IFileStorage } from "../../../../shared/application/interfaces/IFileStorage";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { boardFileKey } from "../../domain/values/FileKey";
import type { IBoardAccess } from "../ports/IBoardAccess";
import type { IBoardFileRepository } from "../ports/IBoardFileRepository";

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
    boardId: string;
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
    const stream = this.storage.stream(
      boardFileKey(input.boardId, input.fileId)
    );
    return ok({ mimeType: file.mimeType, stream });
  }
}
