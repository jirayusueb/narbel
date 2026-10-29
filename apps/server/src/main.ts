import { createAuth } from "@narbel/auth";
import { createDb } from "@narbel/db";

import { createApp } from "./bootstrap/app";
import { ENV } from "./env.server";

const db = createDb(ENV);
const auth = createAuth(ENV, db);

const app = createApp({
  auth,
  db,
  corsOrigin: ENV.CORS_ORIGIN,
  s3: ENV,
}).listen(Number(process.env.PORT ?? 3000), ({ url }) => {
  console.log(`Server is running on ${url}`);
});

const shutdown = async () => {
  await app.stop();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
