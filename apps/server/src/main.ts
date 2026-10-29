import { createAuth } from "@narbel/auth";
import { createDb } from "@narbel/db";
import Redis from "ioredis";

import { createApp } from "./bootstrap/app";
import { ENV } from "./env.server";
import { RedisCache } from "./shared/infrastructure/cache/RedisCache";
import { RedisPubSub } from "./shared/infrastructure/pubsub/RedisPubSub";

const db = createDb(ENV);
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
  s3: ENV,
  resend: ENV,
  webOrigin: ENV.WEB_ORIGIN,
  secret: ENV.BETTER_AUTH_SECRET,
  cache: new RedisCache(redis),
  pubsub,
}).listen(Number(process.env.PORT ?? 3000), ({ url }) => {
  console.log(`Server is running on ${url}`);
});

const shutdown = async () => {
  await app.stop();
  await pubsub.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
