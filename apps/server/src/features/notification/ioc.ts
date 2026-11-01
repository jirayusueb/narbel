import type { Database } from "@narbel/db";
import { Elysia } from "elysia";

import type { IPubSub } from "../../shared/application/interfaces/IPubSub";
import { UuidGenerator } from "../../shared/infrastructure/ids/UuidGenerator";
import { DrizzleOutbox } from "../../shared/infrastructure/outbox/DrizzleOutbox";
import { DrizzleProcessedEvents } from "../../shared/infrastructure/outbox/DrizzleProcessedEvents";
import { DrizzleUnitOfWork } from "../../shared/infrastructure/uow/DrizzleUnitOfWork";
import type { BetterAuthPlugin } from "../auth";
import { DrizzleProfileRepository } from "../profile";
import type { IReadableBoards } from "./application/ports/IReadableBoards";
import { DropBoardNotifications } from "./application/usecases/DropBoardNotifications";
import { ForgetDeletedPerson } from "./application/usecases/ForgetDeletedPerson";
import { ForgetRemovedInvite } from "./application/usecases/ForgetRemovedInvite";
import { HandleDiscussionEvent } from "./application/usecases/HandleDiscussionEvent";
import type { NotificationTx } from "./application/usecases/HandleDiscussionEvent";
import { HandleMemberInvited } from "./application/usecases/HandleMemberInvited";
import { NotificationUseCases } from "./application/usecases/NotificationUseCases";
import { BoardDeletedConsumer } from "./infrastructure/events/BoardDeletedConsumer";
import { DiscussionEventConsumer } from "./infrastructure/events/DiscussionEventConsumer";
import { MemberInvitedConsumer } from "./infrastructure/events/MemberInvitedConsumer";
import { MemberRemovedConsumer } from "./infrastructure/events/MemberRemovedConsumer";
import { PersonDeletedConsumer } from "./infrastructure/events/PersonDeletedConsumer";
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
 * Reads discussion events, boards' member-invited, member-removed and board-deleted, and identity's
 * person-deleted off the outbox: inbox entries, queued or forgotten emails and the processed mark
 * commit together. The worker sends queued emails in the pass right after.
 */
export const createNotificationConsumers = ({
  db,
  pubsub,
  apiOrigin,
}: {
  db: Database;
  pubsub: IPubSub;
  apiOrigin: string;
}) => {
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
  return {
    discussion: new DiscussionEventConsumer(new HandleDiscussionEvent(uow)),
    memberInvited: new MemberInvitedConsumer(new HandleMemberInvited(uow)),
    memberRemoved: new MemberRemovedConsumer(new ForgetRemovedInvite(uow)),
    boardDeleted: new BoardDeletedConsumer(new DropBoardNotifications(uow)),
    personDeleted: new PersonDeletedConsumer(new ForgetDeletedPerson(uow)),
  };
};
