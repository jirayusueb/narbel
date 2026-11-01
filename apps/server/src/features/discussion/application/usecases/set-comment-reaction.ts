import type { IProfileReader } from "../../../../shared/application/interfaces/i-profiles";
import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { Reaction } from "../../domain/values/reaction";
import { presentOne } from "../comment-presenter";
import type { CommentDto } from "../dtos/comment-dto";
import type { IBoardAccess } from "../ports/i-board-access";
import type { ICommentRepository } from "../ports/i-comment-repository";

/** Adds or removes the caller's reaction; viewers may react. Repeating either is a no-op. */
export class SetCommentReaction {
  constructor(
    private readonly access: IBoardAccess,
    private readonly comments: ICommentRepository,
    private readonly profiles: IProfileReader
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    commentId: string;
    emoji: string;
    present: boolean;
  }): Promise<Result<CommentDto, AppError>> {
    const granted = await this.access.decide(
      input.boardId,
      input.actor,
      "read"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const { userId } = input.actor;
    if (!userId) {
      return err(AppError.unauthorized());
    }
    const emoji = Reaction.parse(input.emoji);
    if (emoji.isErr()) {
      return err(emoji.error);
    }
    if (!(await this.comments.findById(input.boardId, input.commentId))) {
      return err(AppError.notFound("Comment"));
    }
    await (input.present
      ? this.comments.addReaction(input.commentId, userId, emoji.value.value)
      : this.comments.removeReaction(
          input.commentId,
          userId,
          emoji.value.value
        ));
    return await presentOne(
      this.comments,
      this.profiles,
      input.boardId,
      input.commentId,
      userId
    );
  }
}
