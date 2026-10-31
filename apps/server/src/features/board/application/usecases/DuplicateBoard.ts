import type { IFileStorage } from "../../../../shared/application/interfaces/IFileStorage";
import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { Board } from "../../domain/entities/Board";
import type { Element } from "../../domain/entities/Element";
import { MAIN_PAGE } from "../../domain/entities/Page";
import type { Page } from "../../domain/entities/Page";
import { MAX_FILE_BYTES } from "../../domain/rules/UploadRules";
import { BoardTitle, TITLE_MAX_LENGTH } from "../../domain/values/BoardTitle";
import { boardFileKey, boardFilePrefix } from "../../domain/values/FileKey";
import type { BoardAccessGuard } from "../BoardAccess";
import { toBoardDto } from "../dtos/BoardDto";
import type { BoardDto } from "../dtos/BoardDto";
import type { IBoardFileRepository } from "../ports/IBoardFileRepository";
import type { IBoardRepository } from "../ports/IBoardRepository";
import type { IBoardScenes } from "../ports/IBoardScenes";

const COPY_SUFFIX = " (copy)";

const copyTitle = (title: string) =>
  `${title.slice(0, TITLE_MAX_LENGTH - COPY_SUFFIX.length).trimEnd()}${COPY_SUFFIX}`;

const COPY_CONCURRENCY = 3;
const COPY_MAX_TOTAL_BYTES = 256 * 1024 * 1024;

/** Runs `fn` over `items`, at most COPY_CONCURRENCY in flight. After a failure nothing new starts, in-flight work settles, then it rethrows. */
const inPool = async <T, R>(
  items: readonly T[],
  fn: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = [];
  const failures: unknown[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    const index = next;
    next += 1;
    const item = items[index];
    if (failures.length > 0 || index >= items.length) {
      return;
    }
    try {
      results[index] = await fn(item as T);
    } catch (error) {
      failures.push(error);
      return;
    }
    await worker();
  };
  await Promise.all(
    Array.from({ length: Math.min(COPY_CONCURRENCY, items.length) }, worker)
  );
  if (failures.length > 0) {
    throw failures[0];
  }
  return results;
};

export class DuplicateBoard {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly boards: IBoardRepository,
    private readonly scenes: IBoardScenes,
    private readonly files: IBoardFileRepository,
    private readonly storage: IFileStorage,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
  }): Promise<Result<BoardDto, AppError>> {
    const { userId } = input.actor;
    if (userId === undefined) {
      return err(AppError.unauthorized());
    }
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "read"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const title = BoardTitle.create(copyTitle(granted.value.board.title.value));
    if (title.isErr()) {
      return err(title.error);
    }
    // one transaction, so a concurrent editor cannot tear the snapshot
    const snapshot = await this.scenes.transact(input.boardId, (s) => {
      const pages = s.pages().map((p): Page => ({ ...p }));
      const elements = pages.flatMap((p) =>
        s
          .all(p.id)
          .filter((e) => !e.isDeleted)
          .map((e): [string, Element] => [p.id, e])
      );
      return { pages, elements };
    });
    const fileIds = new Set(
      snapshot.elements.flatMap(([, e]) =>
        e.type === "image" && typeof e.fileId === "string" ? [e.fileId] : []
      )
    );
    // validate everything before the new board exists, so a bad source leaves nothing behind
    const ids = [...fileIds];
    const checks = await inPool(ids, (fileId) =>
      this.checkFile(input.boardId, fileId)
    );
    const mimeTypes = new Map<string, string>();
    let totalBytes = 0;
    for (const [index, checked] of checks.entries()) {
      if (checked.isErr()) {
        return err(checked.error);
      }
      totalBytes += checked.value.size;
      mimeTypes.set(ids[index] as string, checked.value.mimeType);
    }
    if (totalBytes > COPY_MAX_TOTAL_BYTES) {
      return err(
        AppError.payloadTooLarge("The board's images are too large to copy")
      );
    }
    const board = Board.create(
      this.ids.generate(),
      userId,
      title.value,
      new Date()
    );
    await this.boards.save(board);
    try {
      const created = Date.now();
      // bounded: each copy buffers up to 10 MiB
      await inPool([...mimeTypes], ([fileId, mimeType]) =>
        this.copyFile(input.boardId, board.id, fileId, mimeType)
      );
      await this.scenes.transact(board.id, (s) => {
        // the new document starts with an empty main page; drop it so the source's page order wins
        s.removePage(MAIN_PAGE.id);
        for (const page of snapshot.pages) {
          s.addPage(page);
        }
        for (const [pageId, element] of snapshot.elements) {
          s.put(pageId, element);
        }
        for (const [id, mimeType] of mimeTypes) {
          s.ensureFile({ id, mimeType, created });
        }
      });
      return ok(toBoardDto(board, "owner"));
    } catch (error) {
      // only the new board's own id and prefix are touched, never the source
      await this.scenes.discard(board.id);
      await this.storage.deletePrefix(boardFilePrefix(board.id));
      await this.boards.setTrashed(board.id, new Date());
      await this.boards.deleteTrashed(board.id);
      throw error;
    }
  }

  /** Every referenced image must have a row and an object of usable size, or nothing is copied. */
  private async checkFile(
    sourceId: string,
    fileId: string
  ): Promise<Result<{ mimeType: string; size: number }, AppError>> {
    const row = await this.files.findById(sourceId, fileId);
    const stored =
      row && (await this.storage.stat(boardFileKey(sourceId, fileId)));
    if (!row || !stored || stored.size < 1) {
      return err(
        AppError.conflict(`Image ${fileId} is missing from the board's storage`)
      );
    }
    if (stored.size > MAX_FILE_BYTES) {
      return err(
        AppError.payloadTooLarge(`Image ${fileId} is too large to copy`, {
          fileId,
        })
      );
    }
    return ok({ mimeType: row.mimeType, size: stored.size });
  }

  private async copyFile(
    sourceId: string,
    targetId: string,
    fileId: string,
    mimeType: string
  ) {
    const bytes = await new Response(
      this.storage.stream(boardFileKey(sourceId, fileId))
    ).bytes();
    await this.storage.put(boardFileKey(targetId, fileId), bytes, mimeType);
    await this.files.save(targetId, {
      id: fileId,
      mimeType,
      size: bytes.length,
    });
  }
}
