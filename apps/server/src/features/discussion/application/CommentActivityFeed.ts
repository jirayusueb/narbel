import type { IProfileReader } from "../../../shared/application/interfaces/IProfiles";
import type { Cursor } from "../../../shared/kernel/types/Cursor";
import { presentComments } from "./CommentPresenter";
import type { CommentDto } from "./dtos/CommentDto";
import type { IBoardCommentRepository } from "./ports/ICommentRepository";

/** Comment activity after a cursor, each presented as clients see it, oldest first. */
export class CommentActivityFeed {
  constructor(
    private readonly comments: IBoardCommentRepository,
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
