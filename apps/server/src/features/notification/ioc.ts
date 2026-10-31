import type { Database } from "@narbel/db";
import { Elysia } from "elysia";

import type { IPubSub } from "../../shared/application/interfaces/IPubSub";
import { UuidGenerator } from "../../shared/infrastructure/ids/UuidGenerator";
import type { BetterAuthPlugin } from "../auth";
import type { IReadableBoards } from "./application/ports/IReadableBoards";
import { NotificationUseCases } from "./application/usecases/NotificationUseCases";
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
