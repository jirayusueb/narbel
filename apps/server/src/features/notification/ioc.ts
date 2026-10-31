import type { Database } from "@narbel/db";
import { Elysia } from "elysia";

import type { IPubSub } from "../../shared/application/interfaces/IPubSub";
import { UuidGenerator } from "../../shared/infrastructure/ids/UuidGenerator";
import { DrizzleOutbox } from "../../shared/infrastructure/outbox/DrizzleOutbox";
import { DrizzleProcessedEvents } from "../../shared/infrastructure/outbox/DrizzleProcessedEvents";
import { UnreadableEventError } from "../../shared/infrastructure/outbox/OutboxWorker";
import type { EventConsumer } from "../../shared/infrastructure/outbox/OutboxWorker";
import { DrizzleUnitOfWork } from "../../shared/infrastructure/uow/DrizzleUnitOfWork";
import type { BetterAuthPlugin } from "../auth";
import { DrizzleProfileRepository } from "../profile";
import type { IReadableBoards } from "./application/ports/IReadableBoards";
import { DropBoardNotifications } from "./application/usecases/DropBoardNotifications";
import { ForgetRemovedInvite } from "./application/usecases/ForgetRemovedInvite";
import { HandleDiscussionEvent } from "./application/usecases/HandleDiscussionEvent";
import type { NotificationTx } from "./application/usecases/HandleDiscussionEvent";
import { NotificationUseCases } from "./application/usecases/NotificationUseCases";
import { boardDeletedSchema } from "./infrastructure/events/boardDeletedSchema";
import { discussionEventSchema } from "./infrastructure/events/discussionEventSchema";
import { memberRemovedSchema } from "./infrastructure/events/memberRemovedSchema";
import { DrizzleNotificationRepository } from "./infrastructure/repositories/DrizzleNotificationRepository";
import { createNotificationController } from "./presentation/http/NotificationController";

export interface NotificationDeps {
  db: Database;
  pubsub: IPubSub;
  betterAuth: BetterAuthPlugin;
  readableBoards: IReadableBoards;
}

export const createNotificationModule = ({
  db,
  pubsub,
  betterAuth,
  readableBoards,
}: NotificationDeps) =>
  new Elysia({ name: "feature/notification" }).use(
    createNotificationController(
      betterAuth,
      new NotificationUseCases(
        new DrizzleNotificationRepository(db, pubsub, new UuidGenerator()),
        pubsub,
        readableBoards
      )
    )
  );

/**
 * Reads discussion events and boards' member-removed and board-deleted off the outbox: inbox entries, queued or
 * forgotten emails and the processed mark commit together. The worker sends queued emails in the
 * pass right after.
 */
export const createNotificationConsumers = ({
  db,
  pubsub,
  apiOrigin,
}: {
  db: Database;
  pubsub: IPubSub;
  apiOrigin: string;
}): {
  discussion: EventConsumer;
  memberRemoved: EventConsumer;
  boardDeleted: EventConsumer;
} => {
  const ids = new UuidGenerator();
  const uow = new DrizzleUnitOfWork<NotificationTx>(db, (tx, afterCommit) => ({
    notifications: new DrizzleNotificationRepository(
      tx,
      pubsub,
      ids,
      afterCommit
    ),
    outbox: new DrizzleOutbox(tx, ids),
    processed: new DrizzleProcessedEvents(tx),
    people: new DrizzleProfileRepository(tx, apiOrigin),
  }));
  const handle = new HandleDiscussionEvent(uow);
  const forget = new ForgetRemovedInvite(uow);
  const drop = new DropBoardNotifications(uow);
  return {
    discussion: async (id, payload) => {
      const event = discussionEventSchema.safeParse(payload);
      if (!event.success) {
        throw new UnreadableEventError(event.error.message);
      }
      await handle.execute(id, event.data);
    },
    memberRemoved: async (id, payload) => {
      const event = memberRemovedSchema.safeParse(payload);
      if (!event.success) {
        throw new UnreadableEventError(event.error.message);
      }
      await forget.execute(id, event.data);
    },
    boardDeleted: async (id, payload) => {
      const event = boardDeletedSchema.safeParse(payload);
      if (!event.success) {
        throw new UnreadableEventError(event.error.message);
      }
      await drop.execute(id, event.data);
    },
  };
};
