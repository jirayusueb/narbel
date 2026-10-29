import { cors } from "@elysia/cors";
import { openapi } from "@elysia/openapi";
import type { Database } from "@narbel/db";
import { Elysia } from "elysia";

import { createAuthModule, createBetterAuthPlugin } from "../features/auth";
import { createBoardModule } from "../features/board";
import type { S3Config } from "../features/board/infrastructure/services/BunS3FileStorage";
import type { ResendConfig } from "../features/board/infrastructure/services/ResendEmailSender";
import type { ICache } from "../shared/application/interfaces/ICache";
import type { IPubSub } from "../shared/application/interfaces/IPubSub";
import { errorPlugin } from "../shared/presentation/plugins/errorPlugin";
import { originGuard } from "../shared/presentation/plugins/originGuard";

// Image bytes go straight to S3, so API bodies are small JSON; reject anything bigger before Bun buffers it.
const MAX_REQUEST_BODY_BYTES = 1024 * 1024;

export interface AppDeps {
  auth: Parameters<typeof createBetterAuthPlugin>[0];
  db: Database;
  corsOrigin: string;
  s3: S3Config;
  resend: ResendConfig;
  webOrigin: string;
  /** signs unlock cookies */
  secret: string;
  cache: ICache;
  pubsub: IPubSub;
}

export const createApp = ({
  auth,
  db,
  corsOrigin,
  s3,
  resend,
  webOrigin,
  secret,
  cache,
  pubsub,
}: AppDeps) => {
  const betterAuth = createBetterAuthPlugin(auth);
  return new Elysia({ serve: { maxRequestBodySize: MAX_REQUEST_BODY_BYTES } })
    .use(originGuard(corsOrigin))
    .use(
      cors({
        origin: corsOrigin,
        methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
        credentials: true,
      })
    )
    .use(openapi())
    .use(errorPlugin)
    .get("/", () => "OK")
    .use(createAuthModule({ auth }))
    .use(
      createBoardModule({
        db,
        s3,
        resend,
        webOrigin,
        secret,
        cache,
        pubsub,
        betterAuth,
      })
    );
};

export type App = ReturnType<typeof createApp>;
