import { createAuth } from "@narbel/auth";
import { createDb, migrate } from "@narbel/db";
import Redis from "ioredis";

import { createApp } from "./bootstrap/app";
import { ENV } from "./env.server";
import { boardRecordsIn, DrizzleBoardRepository } from "./features/boards";
import { createDiscussionConsumer } from "./features/discussion";
import {
  backfillBoardText,
  createDrawingConsumer,
  createDrawingRooms,
  createLiveConsumer,
  RedisBoardPresence,
  sweepBoardFiles,
} from "./features/drawing";
import { createNotificationConsumers } from "./features/notification";
import { createDeletePerson } from "./features/profile";
import { createSearchConsumers } from "./features/search";
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
import { pruneOutbox } from "./shared/infrastructure/outbox/pruneOutbox";
import { routeEvents } from "./shared/infrastructure/outbox/routeEvents";
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
// decision 4: the hook deletes the avatar and publishes event.person-deleted before the user row
// goes; the person's comments, and search's mirror of them, go with the row by foreign-key cascade.
const storage = new BunS3FileStorage(ENV);
const deletePerson = createDeletePerson({
  db,
  storage,
  apiOrigin: ENV.BETTER_AUTH_URL,
});
const auth = createAuth(
  ENV,
  db,
  [],
  new RedisSecondaryStorage(redis),
  (person) => deletePerson.execute(person)
);
const pubsub = new RedisPubSub(redis);
const notification = createNotificationConsumers({
  db,
  pubsub,
  apiOrigin: ENV.BETTER_AUTH_URL,
});
const live = createLiveConsumer({ pubsub });
const search = createSearchConsumers({ db });
const cache = new RedisCache(redis);
// one set of live rooms per instance: the HTTP and WebSocket use cases and the board-deleted consumer share it
const rooms = createDrawingRooms({
  db,
  pubsub,
  boardsIn: boardRecordsIn(cache),
  // the worker needs the rooms and the rooms wake the worker; no save runs before both exist
  // oxlint-disable-next-line no-use-before-define -- called only after `outbox` below is built
  wakeOutbox: () => outbox.wake(),
});
const outbox = new OutboxWorker(
  new DrizzleOutboxStore(db),
  new ResendEmailSender(ENV),
  { webOrigin: ENV.WEB_ORIGIN },
  {
    ...DEFAULT_OUTBOX_POLICY,
    baseDelaySeconds: ENV.OUTBOX_BACKOFF_BASE_SECONDS,
    maxAttempts: ENV.OUTBOX_MAX_ATTEMPTS,
  },
  () => new Date(),
  // the event router: each type reaches every context that reacts to it
  routeEvents({
    "event.comment-assigned": [notification.discussion],
    "event.people-mentioned": [notification.discussion],
    "event.thread-replied": [notification.discussion],
    "event.thread-resolved": [notification.discussion],
    "event.comment-posted": [search.comment],
    "event.comment-edited": [search.comment],
    "event.comment-deleted": [search.comment],
    "event.drawing-text-changed": [search.text],
    "event.member-invited": [notification.memberInvited],
    "event.person-deleted": [notification.personDeleted],
    "event.member-removed": [
      createDiscussionConsumer({ db }),
      notification.memberRemoved,
      live,
    ],
    "event.access-changed": [live],
    // discussion and search have no consumer: comments and their search rows still cascade with the board row
    "event.board-deleted": [
      createDrawingConsumer({ db, storage, rooms }),
      notification.boardDeleted,
    ],
  })
);
const app = createApp({
  auth,
  db,
  corsOrigin: ENV.CORS_ORIGIN,
  storage,
  webOrigin: ENV.WEB_ORIGIN,
  apiOrigin: ENV.BETTER_AUTH_URL,
  secret: ENV.BETTER_AUTH_SECRET,
  cache,
  pubsub,
  redis,
  idempotency: new RedisIdempotencyStore(redis),
  wakeOutbox: () => outbox.wake(),
  rooms,
}).listen(Number(process.env.PORT ?? 3000), ({ url }) => {
  console.log(`Server is running on ${url}`);
});

const presence = new RedisBoardPresence(redis);
const GC_EVERY_MS = 60 * 60_000;
const runGc = async () => {
  try {
    await jobLock.runExclusive("gc:board-files", 30 * 60_000, () =>
      sweepBoardFiles({
        db,
        boards: new DrizzleBoardRepository(db),
        storage,
        presence,
      })
    );
  } catch (error) {
    console.error("Board file GC failed", error);
  }
};
const gc = setInterval(() => {
  void runGc();
}, GC_EVERY_MS);

const OUTBOX_PRUNE_EVERY_MS = 60 * 60_000;
const runOutboxPrune = async () => {
  try {
    await jobLock.runExclusive("prune:outbox", 10 * 60_000, () =>
      pruneOutbox(db, new Date())
    );
  } catch (error) {
    console.error("Outbox prune failed", error);
  }
};
const prune = setInterval(() => {
  void runOutboxPrune();
}, OUTBOX_PRUNE_EVERY_MS);

outbox.start();

const shutdown = async () => {
  clearInterval(gc);
  clearInterval(prune);
  await outbox.stop();
  await app.stop();
  await pubsub.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
