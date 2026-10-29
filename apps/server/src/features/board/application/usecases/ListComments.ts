import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import { toCommentDto } from "../dtos/CommentDto";
import type { CommentDto } from "../dtos/CommentDto";
import type { IBoardCommentRepository } from "../ports/IBoardCommentRepository";

export class ListComments {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly comments: IBoardCommentRepository
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    pageId?: string;
  }): Promise<Result<CommentDto[], AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "read"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const rows = await this.comments.list(input.boardId, input.pageId);
    return ok(rows.map(toCommentDto));
  }
}
