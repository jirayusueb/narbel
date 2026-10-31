import { cors } from "@elysia/cors";
import { openapi } from "@elysia/openapi";
import type { Database } from "@narbel/db";
import { Elysia } from "elysia";
import type Redis from "ioredis";

import { createAuthModule, createBetterAuthPlugin } from "../features/auth";
import { createBoardModule, readableBoards } from "../features/board";
import { createNotificationModule } from "../features/notification";
import { createProfileModule } from "../features/profile";
import type { ICache } from "../shared/application/interfaces/ICache";
import type { IFileStorage } from "../shared/application/interfaces/IFileStorage";
import type { IIdempotencyStore } from "../shared/application/interfaces/IIdempotencyStore";
import type { IPubSub } from "../shared/application/interfaces/IPubSub";
import { errorPlugin } from "../shared/presentation/plugins/errorPlugin";
import { originGuard } from "../shared/presentation/plugins/originGuard";

// Image bytes go straight to S3, so API bodies are small JSON; reject anything bigger before Bun buffers it.
const MAX_REQUEST_BODY_BYTES = 1024 * 1024;

export interface AppDeps {
  auth: Parameters<typeof createBetterAuthPlugin>[0];
  db: Database;
  corsOrigin: string;
  storage: IFileStorage;
  webOrigin: string;
  /** where browsers reach this API; avatar urls point here */
  apiOrigin: string;
  /** signs unlock cookies */
  secret: string;
  cache: ICache;
  pubsub: IPubSub;
  redis: Redis;
  idempotency: IIdempotencyStore;
  /** asks the outbox worker for a pass now; called after a commit that queued an event */
  wakeOutbox: () => void;
}

export const createApp = ({
  auth,
  db,
  corsOrigin,
  storage,
  webOrigin,
  apiOrigin,
  secret,
  cache,
  pubsub,
  redis,
  idempotency,
  wakeOutbox,
}: AppDeps) => {
  const betterAuth = createBetterAuthPlugin(auth);
  return new Elysia({
    // the notification stream is idle between 25s heartbeats; Bun's 10s default would cut it
    serve: { maxRequestBodySize: MAX_REQUEST_BODY_BYTES, idleTimeout: 60 },
  })
    .use(originGuard(corsOrigin))
    .use(
      cors({
        origin: corsOrigin,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "x-api-key",
          "Idempotency-Key",
        ],
        credentials: true,
      })
    )
    .use(openapi())
    .use(errorPlugin)
    .state("idempotency", idempotency)
    .get("/", () => "OK")
    .use(createAuthModule({ auth }))
    .use(createProfileModule({ db, storage, apiOrigin, betterAuth, auth }))
    .use(
      createNotificationModule({
        db,
        pubsub,
        betterAuth,
        readableBoards: {
          readableBoardTitles: (person) => readableBoards(db, person),
        },
      })
    )
    .use(
      createBoardModule({
        db,
        storage,
        webOrigin,
        apiOrigin,
        secret,
        cache,
        pubsub,
        redis,
        betterAuth,
        wakeOutbox,
      })
    );
};

export type App = ReturnType<typeof createApp>;
