import type { IProfileReader } from "../../../../shared/application/interfaces/IProfiles";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { parseReaction } from "../../domain/values/Reaction";
import { presentOne } from "../CommentPresenter";
import type { CommentDto } from "../dtos/CommentDto";
import type { IBoardAccess } from "../ports/IBoardAccess";
import type { IBoardCommentRepository } from "../ports/ICommentRepository";

/** Adds or removes the caller's reaction; viewers may react. Repeating either is a no-op. */
export class SetCommentReaction {
  constructor(
    private readonly access: IBoardAccess,
    private readonly comments: IBoardCommentRepository,
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
    const emoji = parseReaction(input.emoji);
    if (emoji.isErr()) {
      return err(emoji.error);
    }
    if (!(await this.comments.findById(input.boardId, input.commentId))) {
      return err(AppError.notFound("Comment"));
    }
    await (input.present
      ? this.comments.addReaction(input.commentId, userId, emoji.value)
      : this.comments.removeReaction(input.commentId, userId, emoji.value));
    return await presentOne(
      this.comments,
      this.profiles,
      input.boardId,
      input.commentId,
      userId
    );
  }
}
