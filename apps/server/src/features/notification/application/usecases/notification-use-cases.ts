import { notificationChannel } from "../../../../shared/application/interfaces/i-notifications";
import type {
  INotificationRepository,
  NotificationPage,
} from "../../../../shared/application/interfaces/i-notifications";
import type { IPubSub } from "../../../../shared/application/interfaces/i-pub-sub";
import type { AppError } from "../../../../shared/kernel/errors/app-error";
import { decodeCursor } from "../../../../shared/kernel/types/cursor";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import type { IReadableBoards } from "../ports/i-readable-boards";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** An invitation shows the board's current title, not the one it had when sent. */
const withCurrentTitles = (
  page: NotificationPage,
  titles: Map<string, string>
): NotificationPage => ({
  ...page,
  items: page.items.map((item) => {
    const title =
      item.kind === "board.invited" ? titles.get(item.boardId) : undefined;
    return title ? { ...item, boardTitle: title } : item;
  }),
});

export class NotificationUseCases {
  constructor(
    private readonly notifications: INotificationRepository,
    private readonly pubsub: IPubSub,
    private readonly readable: IReadableBoards
  ) {}

  async list(
    userId: string,
    email: string,
    input: { cursor?: string; limit?: number }
  ): Promise<Result<NotificationPage, AppError>> {
    const after = input.cursor ? decodeCursor(input.cursor) : null;
    if (after?.isErr()) {
      return err(after.error);
    }
    // decision 3: access is re-checked at list time, so a removed member stops seeing the board
    const readable = await this.readable.readableBoards({ id: userId, email });
    const titles = new Map(readable.map((board) => [board.id, board.title]));
    const page = await this.notifications.list(
      userId,
      {
        after: after?.isOk() ? after.value : null,
        limit: Math.min(
          Math.max(Math.trunc(input.limit ?? DEFAULT_LIMIT), 1),
          MAX_LIMIT
        ),
      },
      [...titles.keys()]
    );
    return ok(withCurrentTitles(page, titles));
  }

  async markRead(
    userId: string,
    email: string,
    ids?: string[]
  ): Promise<Result<{ unreadCount: number }, AppError>> {
    const readable = await this.readable.readableBoards({ id: userId, email });
    return ok({
      unreadCount: await this.notifications.markRead(
        userId,
        ids,
        readable.map((board) => board.id)
      ),
    });
  }

  /** Raw JSON of each new notification for `userId`; the result stops the feed. */
  subscribe(userId: string, onMessage: (json: Uint8Array) => void) {
    return this.pubsub.subscribe(notificationChannel(userId), onMessage);
  }
}
