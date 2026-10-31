import type { IProfileReader } from "../../../../shared/application/interfaces/IProfiles";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { decodeCursor } from "../../../../shared/kernel/types/Cursor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { presentPage } from "../CommentPresenter";
import type { CommentDto, Paged } from "../dtos/CommentDto";
import type { IBoardAccess } from "../ports/IBoardAccess";
import type {
  IBoardCommentRepository,
  ThreadStatus,
} from "../ports/ICommentRepository";

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export const parsePaging = (input: {
  cursor?: string;
  limit?: number;
}): Result<
  { after: ReturnType<typeof decodeCursor>; limit: number },
  AppError
> => {
  const after = input.cursor ? decodeCursor(input.cursor) : null;
  return input.cursor && !after
    ? err(AppError.validation("Invalid cursor"))
    : ok({
        after,
        limit: Math.min(
          Math.max(Math.trunc(input.limit ?? DEFAULT_PAGE_SIZE), 1),
          MAX_PAGE_SIZE
        ),
      });
};

/** Thread roots, newest first; omit `pageId` for the whole board. */
export class ListComments {
  constructor(
    private readonly guard: IBoardAccess,
    private readonly comments: IBoardCommentRepository,
    private readonly profiles: IProfileReader
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    pageId?: string;
    status?: ThreadStatus;
    cursor?: string;
    limit?: number;
  }): Promise<Result<Paged<CommentDto>, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "read"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const paging = parsePaging(input);
    if (paging.isErr()) {
      return err(paging.error);
    }
    const { after, limit } = paging.value;
    const views = await this.comments.listThreads({
      boardId: input.boardId,
      pageId: input.pageId,
      status: input.status ?? "open",
      after,
      limit: limit + 1,
      viewerId: input.actor.userId,
    });
    return ok(await presentPage(views, limit, this.profiles));
  }
}
