import { cors } from "@elysia/cors";
import { openapi } from "@elysia/openapi";
import type { Database } from "@narbel/db";
import { Elysia } from "elysia";

import { createAuthModule, createBetterAuthPlugin } from "../features/auth";
import { createBoardModule } from "../features/board";
import type { S3Config } from "../features/board/infrastructure/services/BunS3FileStorage";
import { errorPlugin } from "../shared/presentation/plugins/errorPlugin";
import { originGuard } from "../shared/presentation/plugins/originGuard";

// Uploads cap at 10 MiB; reject bigger bodies before Bun buffers them (default 128 MiB).
const MAX_REQUEST_BODY_BYTES = 11 * 1024 * 1024;

export interface AppDeps {
  auth: Parameters<typeof createBetterAuthPlugin>[0];
  db: Database;
  corsOrigin: string;
  s3: S3Config;
}

export const createApp = ({ auth, db, corsOrigin, s3 }: AppDeps) => {
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
    .use(createBoardModule({ db, s3, betterAuth }));
};

export type App = ReturnType<typeof createApp>;
