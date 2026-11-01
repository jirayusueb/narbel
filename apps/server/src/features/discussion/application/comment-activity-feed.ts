import type { IProfileReader } from "../../../shared/application/interfaces/i-profiles";
import type { Cursor } from "../../../shared/kernel/types/cursor";
import { presentComments } from "./comment-presenter";
import type { CommentDto } from "./dtos/comment-dto";
import type { ICommentRepository } from "./ports/i-comment-repository";

/** Comment activity after a cursor, each presented as clients see it, oldest first. */
export class CommentActivityFeed {
  constructor(
    private readonly comments: ICommentRepository,
    private readonly profiles: IProfileReader
  ) {}

  async since(input: {
    boardId: string;
    after: Cursor;
    limit: number;
    viewerId?: string;
  }): Promise<{ activityAt: Date; comment: CommentDto }[]> {
    const rows = await this.comments.listActivity(input);
    const shown = await presentComments(rows, this.profiles);
    return rows.flatMap((row, index) => {
      const comment = shown[index];
      return comment ? [{ activityAt: row.activityAt, comment }] : [];
    });
  }
}
