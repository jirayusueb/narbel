import { createAuth } from "@narbel/auth";
import { createDb, migrate } from "@narbel/db";
import Redis from "ioredis";

import { createApp } from "./bootstrap/app";
import { ENV } from "./env.server";
import {
  backfillBoardText,
  RedisBoardPresence,
  sweepBoardFiles,
} from "./features/board";
import { RedisSecondaryStorage } from "./shared/infrastructure/auth/RedisSecondaryStorage";
import { RedisCache } from "./shared/infrastructure/cache/RedisCache";
import { ResendEmailSender } from "./shared/infrastructure/email/ResendEmailSender";
import { RedisIdempotencyStore } from "./shared/infrastructure/idempotency/RedisIdempotencyStore";
import { RedisJobLock } from "./shared/infrastructure/lock/RedisJobLock";
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
// fail fast in an outage: ioredis defaults queue a command through 20 reconnects, so requests hung for a minute.
// A queued command waits for the next reconnect attempt, so the backoff cap bounds each Redis call's outage delay.
const redis = new Redis(ENV.REDIS_URL, {
  maxRetriesPerRequest: 1,
  commandTimeout: 2000,
  retryStrategy: (attempt) => Math.min(attempt * 50, 500),
});
redis.on("error", (error) => {
  console.error("Redis error", error);
});
const jobLock = new RedisJobLock(redis);
await jobLock.runExclusive("boot:backfill-board-text", 60_000, () =>
  backfillBoardText(db)
);
const auth = createAuth(ENV, db, [], new RedisSecondaryStorage(redis));
const pubsub = new RedisPubSub(redis);

const storage = new BunS3FileStorage(ENV);
const app = createApp({
  auth,
  db,
  corsOrigin: ENV.CORS_ORIGIN,
  storage,
  webOrigin: ENV.WEB_ORIGIN,
  apiOrigin: ENV.BETTER_AUTH_URL,
  secret: ENV.BETTER_AUTH_SECRET,
  cache: new RedisCache(redis),
  pubsub,
  redis,
  idempotency: new RedisIdempotencyStore(redis),
}).listen(Number(process.env.PORT ?? 3000), ({ url }) => {
  console.log(`Server is running on ${url}`);
});

const presence = new RedisBoardPresence(redis);
const GC_EVERY_MS = 60 * 60_000;
const runGc = async () => {
  try {
    await jobLock.runExclusive("gc:board-files", 30 * 60_000, () =>
      sweepBoardFiles({ db, storage, presence })
    );
  } catch (error) {
    console.error("Board file GC failed", error);
  }
};
const gc = setInterval(() => {
  void runGc();
}, GC_EVERY_MS);

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
  clearInterval(gc);
  await outbox.stop();
  await app.stop();
  await pubsub.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
