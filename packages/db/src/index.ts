import { drizzle } from "drizzle-orm/node-postgres";

import type { DatabaseConfig } from "./config";
import { relations } from "./relations";

export const createDb = (env: DatabaseConfig) =>
  drizzle(env.DATABASE_URL, { relations });

export type Database = ReturnType<typeof createDb>;

// the server has no direct drizzle-orm dependency; query operators come through here
export {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
export { migrate } from "drizzle-orm/node-postgres/migrator";

export type DbTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
/** What repositories need: satisfied by both the pool and a transaction. */
export type DbExecutor = Pick<
  Database,
  "select" | "insert" | "update" | "delete"
>;
