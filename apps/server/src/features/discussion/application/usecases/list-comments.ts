import type { IProfileReader } from "../../../../shared/application/interfaces/i-profiles";
import type { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { presentPage } from "../comment-presenter";
import type { CommentDto, Paged } from "../dtos/comment-dto";
import { parsePaging } from "../paging";
import type { IBoardAccess } from "../ports/i-board-access";
import type {
  ICommentRepository,
  ThreadStatus,
} from "../ports/i-comment-repository";

/** Thread roots, newest first; omit `pageId` for the whole board. */
export class ListComments {
  constructor(
    private readonly access: IBoardAccess,
    private readonly comments: ICommentRepository,
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
    const granted = await this.access.decide(
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
