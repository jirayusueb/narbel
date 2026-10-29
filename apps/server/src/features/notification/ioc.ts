import type { Database } from "@narbel/db";
import { Elysia } from "elysia";

import type { IPubSub } from "../../shared/application/interfaces/IPubSub";
import { UuidGenerator } from "../../shared/infrastructure/ids/UuidGenerator";
import { DrizzleNotificationRepository } from "../../shared/infrastructure/notifications/DrizzleNotificationRepository";
import type { BetterAuthPlugin } from "../auth";
import { NotificationUseCases } from "./application/usecases/NotificationUseCases";
import { createNotificationController } from "./presentation/http/NotificationController";

export interface NotificationDeps {
  db: Database;
  pubsub: IPubSub;
  betterAuth: BetterAuthPlugin;
}

export const createNotificationModule = ({
  db,
  pubsub,
  betterAuth,
}: NotificationDeps) =>
  new Elysia({ name: "feature/notification" }).use(
    createNotificationController(
      betterAuth,
      new NotificationUseCases(
        new DrizzleNotificationRepository(db, pubsub, new UuidGenerator()),
        pubsub
      )
    )
  );
