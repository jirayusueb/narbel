import { and, desc, eq, inArray, isNull, lt, or, sql } from "@narbel/db";
import type { DbExecutor } from "@narbel/db";
import { notification } from "@narbel/db/schema/account";

import type { IIdGenerator } from "../../application/interfaces/IIdGenerator";
import { notificationChannel } from "../../application/interfaces/INotifications";
import type {
  INotificationRepository,
  NotificationDto,
  NotificationPayload,
} from "../../application/interfaces/INotifications";
import type { IPubSub } from "../../application/interfaces/IPubSub";
import { decodeCursor, encodeCursor } from "../../kernel/types/Cursor";
import type { AfterCommit } from "../uow/DrizzleUnitOfWork";

type Row = typeof notification.$inferSelect;

const toDto = (row: Row): NotificationDto =>
  ({
    ...row.payload,
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  }) as NotificationDto;

const runNow: AfterCommit = async (hook) => {
  try {
    await hook();
  } catch (error) {
    console.error("Notification hook failed", error);
  }
};

const unread = (userId: string) =>
  and(eq(notification.userId, userId), isNull(notification.readAt));

export class DrizzleNotificationRepository implements INotificationRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly pubsub: IPubSub,
    private readonly ids: IIdGenerator,
    private readonly afterCommit: AfterCommit = runNow
  ) {}

  async add(userId: string, payload: NotificationPayload) {
    const row: Row = {
      id: this.ids.generate(),
      userId,
      kind: payload.kind,
      payload,
      readAt: null,
      createdAt: new Date(),
    };
    await this.db.insert(notification).values(row);
    const message = new TextEncoder().encode(JSON.stringify(toDto(row)));
    this.afterCommit(() =>
      this.pubsub.publish(notificationChannel(userId), message)
    );
  }

  async deleteForBoard(boardId: string) {
    await this.db
      .delete(notification)
      .where(sql`${notification.payload}->>'boardId' = ${boardId}`);
  }

  async list(userId: string, page: { cursor: string | null; limit: number }) {
    const cursor = page.cursor ? decodeCursor(page.cursor) : null;
    const rows = await this.db
      .select()
      .from(notification)
      .where(
        and(
          eq(notification.userId, userId),
          cursor
            ? or(
                lt(notification.createdAt, cursor.at),
                and(
                  eq(notification.createdAt, cursor.at),
                  lt(notification.id, cursor.id)
                )
              )
            : undefined
        )
      )
      .orderBy(desc(notification.createdAt), desc(notification.id))
      .limit(page.limit + 1);
    const items = rows.slice(0, page.limit);
    const last = items.at(-1);
    return {
      items: items.map(toDto),
      nextCursor:
        rows.length > page.limit && last
          ? encodeCursor({ at: last.createdAt, id: last.id })
          : null,
      unreadCount: await this.countUnread(userId),
    };
  }

  async markRead(userId: string, ids: string[] | undefined) {
    if (ids?.length !== 0) {
      await this.db
        .update(notification)
        .set({ readAt: new Date() })
        .where(
          and(unread(userId), ids ? inArray(notification.id, ids) : undefined)
        );
    }
    return await this.countUnread(userId);
  }

  private async countUnread(userId: string) {
    const [row] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(notification)
      .where(unread(userId));
    return row?.value ?? 0;
  }
}
