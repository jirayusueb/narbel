import { notificationChannel } from "../../../../shared/application/interfaces/INotifications";
import type {
  INotificationRepository,
  NotificationPage,
} from "../../../../shared/application/interfaces/INotifications";
import type { IPubSub } from "../../../../shared/application/interfaces/IPubSub";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import { decodeCursor } from "../../../../shared/kernel/types/Cursor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class NotificationUseCases {
  constructor(
    private readonly notifications: INotificationRepository,
    private readonly pubsub: IPubSub
  ) {}

  async list(
    userId: string,
    input: { cursor?: string; limit?: number }
  ): Promise<Result<NotificationPage, AppError>> {
    if (input.cursor && !decodeCursor(input.cursor)) {
      return err(AppError.validation("Invalid cursor"));
    }
    return ok(
      await this.notifications.list(userId, {
        cursor: input.cursor ?? null,
        limit: Math.min(
          Math.max(Math.trunc(input.limit ?? DEFAULT_LIMIT), 1),
          MAX_LIMIT
        ),
      })
    );
  }

  async markRead(
    userId: string,
    ids?: string[]
  ): Promise<Result<{ unreadCount: number }, AppError>> {
    return ok({ unreadCount: await this.notifications.markRead(userId, ids) });
  }

  /** Raw JSON of each new notification for `userId`; the result stops the feed. */
  subscribe(userId: string, onMessage: (json: Uint8Array) => void) {
    return this.pubsub.subscribe(notificationChannel(userId), onMessage);
  }
}
