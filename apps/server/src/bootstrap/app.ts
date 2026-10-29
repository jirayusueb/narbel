import { cors } from "@elysia/cors";
import { openapi } from "@elysia/openapi";
import type { Database } from "@narbel/db";
import { Elysia } from "elysia";

import { createAuthModule, createBetterAuthPlugin } from "../features/auth";
import { createBoardModule } from "../features/board";
import type { S3Config } from "../features/board/infrastructure/services/BunS3FileStorage";
import { errorPlugin } from "../shared/presentation/plugins/errorPlugin";

export interface AppDeps {
  auth: Parameters<typeof createBetterAuthPlugin>[0];
  db: Database;
  corsOrigin: string;
  s3: S3Config;
}

export function createApp({ auth, db, corsOrigin, s3 }: AppDeps) {
  const betterAuth = createBetterAuthPlugin(auth);
  return new Elysia()
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
}

export type App = ReturnType<typeof createApp>;
