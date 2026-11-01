import type { Database } from "@narbel/db";
import { Elysia } from "elysia";

import type { IPubSub } from "../../shared/application/interfaces/i-pub-sub";
import { UuidGenerator } from "../../shared/infrastructure/ids/uuid-generator";
import { DrizzleOutbox } from "../../shared/infrastructure/outbox/drizzle-outbox";
import { DrizzleProcessedEvents } from "../../shared/infrastructure/outbox/drizzle-processed-events";
import { DrizzleUnitOfWork } from "../../shared/infrastructure/uow/drizzle-unit-of-work";
import type { BetterAuthPlugin } from "../auth";
import { DrizzleProfileRepository } from "../profile";
import type { IReadableBoards } from "./application/ports/i-readable-boards";
import { DropBoardNotifications } from "./application/usecases/drop-board-notifications";
import { ForgetDeletedPerson } from "./application/usecases/forget-deleted-person";
import { ForgetRemovedInvite } from "./application/usecases/forget-removed-invite";
import { HandleDiscussionEvent } from "./application/usecases/handle-discussion-event";
import type { NotificationTx } from "./application/usecases/handle-discussion-event";
import { HandleMemberInvited } from "./application/usecases/handle-member-invited";
import { NotificationUseCases } from "./application/usecases/notification-use-cases";
import { BoardDeletedConsumer } from "./infrastructure/events/board-deleted-consumer";
import { DiscussionEventConsumer } from "./infrastructure/events/discussion-event-consumer";
import { MemberInvitedConsumer } from "./infrastructure/events/member-invited-consumer";
import { MemberRemovedConsumer } from "./infrastructure/events/member-removed-consumer";
import { PersonDeletedConsumer } from "./infrastructure/events/person-deleted-consumer";
import { DrizzleNotificationRepository } from "./infrastructure/repositories/drizzle-notification-repository";
import { createNotificationController } from "./presentation/http/notification-controller";

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
