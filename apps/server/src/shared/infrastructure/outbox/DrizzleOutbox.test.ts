import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { createDb, sql } from "@narbel/db";

import { UuidGenerator } from "../ids/UuidGenerator";
import { DrizzleOutbox } from "./DrizzleOutbox";

// Runs against the local dev postgres inside a throwaway schema, skipped when postgres is down.
const BASE =
  process.env.DATABASE_URL ??
  "postgresql://postgres:password@localhost:5432/narbel";
const SCHEMA = `outbox_drop_test_${process.pid}`;
const url = `${BASE}${BASE.includes("?") ? "&" : "?"}options=-c%20search_path%3D${SCHEMA}`;

const admin = createDb({ DATABASE_URL: BASE });
const db = createDb({ DATABASE_URL: url });

const reachable = await admin
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!reachable)("DrizzleOutbox.forgetPendingTo (postgres)", () => {
  const queue = new DrizzleOutbox(db, new UuidGenerator());

  beforeAll(async () => {
    await admin.execute(sql.raw(`create schema "${SCHEMA}"`));
    await admin.execute(
      sql.raw(
        `create table "${SCHEMA}".outbox (like public.outbox including all)`
      )
    );
    await queue.enqueue(
      { type: "email.mentioned", to: "gone@x.io" } as never,
      "keep:1"
    );
    await queue.enqueue(
      { type: "email.mentioned", to: "gone@x.io" } as never,
      "keep:2"
    );
    await queue.enqueue(
      { type: "email.mentioned", to: "stay@x.io" } as never,
      "keep:3"
    );
  });
  afterAll(async () => {
    await admin.execute(sql.raw(`drop schema "${SCHEMA}" cascade`));
  });

  it("drops only the person's pending emails", async () => {
    await db.execute(
      sql`update "outbox" set status = 'sent', sent_at = now() where dedupe_key = 'keep:2'`
    );
    await queue.forgetPendingTo("gone@x.io");
    const rows = await db.execute<{ dedupe_key: string }>(
      sql`select dedupe_key from "outbox" order by dedupe_key`
    );
    expect(rows.rows.map((row) => row.dedupe_key)).toEqual([
      "keep:2",
      "keep:3",
    ]);
  });
});
