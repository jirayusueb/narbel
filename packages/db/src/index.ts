import { drizzle } from "drizzle-orm/node-postgres";

import type { DatabaseConfig } from "./config";
import { relations } from "./relations";

export const createDb = (env: DatabaseConfig) =>
  drizzle(env.DATABASE_URL, { relations });

export type Database = ReturnType<typeof createDb>;

// the server has no direct drizzle-orm dependency; query operators come through here
export { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
