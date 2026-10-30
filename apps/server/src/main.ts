import { createAuth } from "@narbel/auth";
import { createDb, migrate } from "@narbel/db";
import Redis from "ioredis";

import { createApp } from "./bootstrap/app";
import { ENV } from "./env.server";
import { backfillBoardText } from "./features/board";
import { RedisCache } from "./shared/infrastructure/cache/RedisCache";
import { ResendEmailSender } from "./shared/infrastructure/email/ResendEmailSender";
import { DrizzleOutboxStore } from "./shared/infrastructure/outbox/DrizzleOutboxStore";
import {
  DEFAULT_OUTBOX_POLICY,
  OutboxWorker,
} from "./shared/infrastructure/outbox/OutboxWorker";
import { RedisPubSub } from "./shared/infrastructure/pubsub/RedisPubSub";
import { BunS3FileStorage } from "./shared/infrastructure/storage/BunS3FileStorage";

const db = createDb(ENV);
// set only in the deployed image, which ships the migrations folder; dev uses drizzle-kit
if (process.env.MIGRATIONS_DIR) {
  await migrate(db, { migrationsFolder: process.env.MIGRATIONS_DIR });
}
await backfillBoardText(db);
const auth = createAuth(ENV, db);
const redis = new Redis(ENV.REDIS_URL);
redis.on("error", (error) => {
  console.error("Redis error", error);
});
const pubsub = new RedisPubSub(redis);

const app = createApp({
  auth,
  db,
  corsOrigin: ENV.CORS_ORIGIN,
  storage: new BunS3FileStorage(ENV),
  webOrigin: ENV.WEB_ORIGIN,
  apiOrigin: ENV.BETTER_AUTH_URL,
  secret: ENV.BETTER_AUTH_SECRET,
  cache: new RedisCache(redis),
  pubsub,
  redis,
}).listen(Number(process.env.PORT ?? 3000), ({ url }) => {
  console.log(`Server is running on ${url}`);
});

const outbox = new OutboxWorker(
  new DrizzleOutboxStore(db),
  new ResendEmailSender(ENV),
  { webOrigin: ENV.WEB_ORIGIN },
  {
    ...DEFAULT_OUTBOX_POLICY,
    baseDelaySeconds: ENV.OUTBOX_BACKOFF_BASE_SECONDS,
    maxAttempts: ENV.OUTBOX_MAX_ATTEMPTS,
  }
);
outbox.start();

const shutdown = async () => {
  await outbox.stop();
  await app.stop();
  await pubsub.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
