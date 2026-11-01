import type { IProfileReader } from "../../../../shared/application/interfaces/i-profiles";
import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { presentPage } from "../comment-presenter";
import type { CommentDto, Paged } from "../dtos/comment-dto";
import { parsePaging } from "../paging";
import type { IBoardAccess } from "../ports/i-board-access";
import type { ICommentRepository } from "../ports/i-comment-repository";

/** Replies of one thread, oldest first. */
export class ListReplies {
  constructor(
    private readonly access: IBoardAccess,
    private readonly comments: ICommentRepository,
    private readonly profiles: IProfileReader
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    commentId: string;
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
    const root = await this.comments.findById(input.boardId, input.commentId);
    if (!root || root.parentId !== null) {
      return err(AppError.notFound("Comment"));
    }
    const { after, limit } = paging.value;
    const views = await this.comments.listReplies({
      boardId: input.boardId,
      threadId: root.id,
      after,
      limit: limit + 1,
      viewerId: input.actor.userId,
    });
    return ok(await presentPage(views, limit, this.profiles));
  }
}
