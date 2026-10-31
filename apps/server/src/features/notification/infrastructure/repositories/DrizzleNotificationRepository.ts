import { and, desc, eq, inArray, isNull, lt, or, sql } from "@narbel/db";
import type { DbExecutor } from "@narbel/db";
import { notification } from "@narbel/db/schema/account";

import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import { notificationChannel } from "../../../../shared/application/interfaces/INotifications";
import type {
  INotificationRepository,
  NotificationDto,
  NotificationPayload,
} from "../../../../shared/application/interfaces/INotifications";
import type { IPubSub } from "../../../../shared/application/interfaces/IPubSub";
import type { AfterCommit } from "../../../../shared/infrastructure/uow/DrizzleUnitOfWork";
import {
  decodeCursor,
  encodeCursor,
} from "../../../../shared/kernel/types/Cursor";

type Row = typeof notification.$inferSelect;
const onReadableBoards = (readableBoardIds: string[]) =>
  inArray(sql`${notification.payload}->>'boardId'`, readableBoardIds);

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

  async list(
    userId: string,
    page: { cursor: string | null; limit: number },
    readableBoardIds: string[]
  ) {
    if (readableBoardIds.length === 0) {
      return { items: [], nextCursor: null, unreadCount: 0 };
    }
    const readable = onReadableBoards(readableBoardIds);
    const cursor = page.cursor ? decodeCursor(page.cursor) : null;
    const rows = await this.db
      .select()
      .from(notification)
      .where(
        and(
          eq(notification.userId, userId),
          readable,
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
      unreadCount: await this.countUnread(userId, readableBoardIds),
    };
  }

  async markRead(
    userId: string,
    ids: string[] | undefined,
    readableBoardIds: string[]
  ) {
    if (readableBoardIds.length === 0) {
      return 0;
    }
    const readable = onReadableBoards(readableBoardIds);
    if (ids?.length !== 0) {
      await this.db
        .update(notification)
        .set({ readAt: new Date() })
        .where(
          and(
            unread(userId),
            readable,
            ids ? inArray(notification.id, ids) : undefined
          )
        );
    }
    return await this.countUnread(userId, readableBoardIds);
  }

  private async countUnread(userId: string, readableBoardIds: string[]) {
    const [row] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(notification)
      .where(and(unread(userId), onReadableBoards(readableBoardIds)));
    return row?.value ?? 0;
  }
}
