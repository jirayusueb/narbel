import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { ChangeCursor } from "../../domain/values/ChangeCursor";
import type { AccessPolicy } from "../AccessPolicy";
import { toPageChanges } from "../dtos/ChangesDto";
import type { BoardChangesDto } from "../dtos/ChangesDto";
import type { IBoardScenes } from "../ports/IBoardScenes";
import type { ICommentActivity } from "../ports/ICommentActivity";

export const MAX_ELEMENT_CHANGES = 100;
export const MAX_COMMENT_CHANGES = 50;

const badCursor = () =>
  AppError.validation(
    "since is not a get_changes cursor for this board; call get_changes without since to start again"
  );

/** What humans changed on a board since an agent's cursor: elements via the live CRDT, comments via discussion. */
export class GetBoardChanges {
  constructor(
    private readonly policy: AccessPolicy,
    private readonly scenes: IBoardScenes,
    private readonly comments: ICommentActivity,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    since?: string;
  }): Promise<Result<BoardChangesDto, AppError>> {
    const granted = await this.policy.decide(
      input.boardId,
      input.actor,
      "read"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const cursor = input.since
      ? ChangeCursor.parse(input.since, input.boardId)
      : null;
    if (input.since && !cursor) {
      return err(badCursor());
    }
    const read = await this.scenes.transact(input.boardId, (s) => {
      const found = s.changesSince(cursor?.scene ?? null);
      return (
        found && {
          version: found.version,
          ...toPageChanges(found.touches, s, MAX_ELEMENT_CHANGES),
        }
      );
    });
    if (!read) {
      return err(badCursor());
    }
    const activity = cursor
      ? await this.comments.since({
          boardId: input.boardId,
          after: cursor.comments,
          limit: MAX_COMMENT_CHANGES + 1,
          viewerId: input.actor.userId,
        })
      : [];
    const shown = activity.slice(0, MAX_COMMENT_CHANGES);
    const last = shown.at(-1);
    const next = cursor
      ? cursor.advance(
          read.version,
          last && { at: last.activityAt, id: last.comment.id }
        )
      : ChangeCursor.start(input.boardId, read.version, this.now());
    return ok({
      cursor: next.encode(),
      pages: read.pages,
      omitted: read.omitted,
      comments: shown.map((change) => change.comment),
      moreComments: activity.length > MAX_COMMENT_CHANGES,
    });
  }
}
