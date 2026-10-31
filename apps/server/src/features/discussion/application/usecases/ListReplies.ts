import type { IProfileReader } from "../../../../shared/application/interfaces/IProfiles";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { presentPage } from "../CommentPresenter";
import type { CommentDto, Paged } from "../dtos/CommentDto";
import type { IBoardAccess } from "../ports/IBoardAccess";
import type { IBoardCommentRepository } from "../ports/ICommentRepository";
import { parsePaging } from "./ListComments";

/** Replies of one thread, oldest first. */
export class ListReplies {
  constructor(
    private readonly guard: IBoardAccess,
    private readonly comments: IBoardCommentRepository,
    private readonly profiles: IProfileReader
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    commentId: string;
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
