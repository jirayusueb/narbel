import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { createDb, sql } from "@narbel/db";
import { outbox } from "@narbel/db/schema/account";

import { UuidGenerator } from "../ids/UuidGenerator";
import { DrizzleOutbox } from "./DrizzleOutbox";
import { DrizzleOutboxStore } from "./DrizzleOutboxStore";

// Runs against the local dev postgres inside a throwaway schema: the pool's search_path points
// every unqualified table at it, so nothing in `public` is touched. Skipped when postgres is down.
const BASE =
  process.env.DATABASE_URL ??
  "postgresql://postgres:password@localhost:5432/narbel";
const SCHEMA = `outbox_test_${process.pid}`;
const url = `${BASE}${BASE.includes("?") ? "&" : "?"}options=-c%20search_path%3D${SCHEMA}`;

const admin = createDb({ DATABASE_URL: BASE });
const db = createDb({ DATABASE_URL: url });

const reachable = await admin
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!reachable)("DrizzleOutboxStore (postgres)", () => {
  beforeAll(async () => {
    await admin.execute(sql.raw(`create schema "${SCHEMA}"`));
    await admin.execute(
      sql.raw(
        `create table "${SCHEMA}".outbox (like public.outbox including all)`
      )
    );
  });
  afterAll(async () => {
    await admin.execute(sql.raw(`drop schema "${SCHEMA}" cascade`));
  });

  const message = (to: string) => ({
    type: "email.mentioned" as const,
    to,
    boardId: "b",
    commentId: "c",
    actorName: "A",
    excerpt: "x",
  });
  const lease = (now: Date) => (before: number) =>
    new Date(now.getTime() + 30_000 * 2 ** before);

  it("dedupes by key, claims due rows once, and transitions pending -> sent / dead", async () => {
    const queue = new DrizzleOutbox(db, new UuidGenerator());
    await queue.enqueue(message("a@x.io"), "k1");
    await queue.enqueue(message("a@x.io"), "k1");
    await queue.enqueue(message("b@x.io"), "k2");
    const store = new DrizzleOutboxStore(db);
    const now = new Date();

    const first = await store.claimDue(now, 10, lease(now));
    expect(first).toHaveLength(2);
    expect(first.every((m) => m.attempts === 1)).toBe(true);
    expect(await store.claimDue(now, 10, lease(now))).toHaveLength(0);

    const [a, b] = first;
    await store.markSent(a?.id ?? "", now);
    await store.markFailed(b?.id ?? "", "boom", true);
    const rows = await db.select().from(outbox);
    expect(rows.map((r) => r.status).toSorted()).toEqual(["dead", "sent"]);
    expect(rows.find((r) => r.status === "dead")?.lastError).toBe("boom");

    const later = new Date(now.getTime() + 3_600_000);
    expect(await store.claimDue(later, 10, lease(later))).toHaveLength(0);
  });

  it("never hands the same row to two concurrent workers (SKIP LOCKED)", async () => {
    const queue = new DrizzleOutbox(db, new UuidGenerator());
    for (let i = 0; i < 6; i += 1) {
      await queue.enqueue(message(`c${i}@x.io`), `skip-${i}`);
    }
    const store = new DrizzleOutboxStore(db);
    const now = new Date(Date.now() + 10_000_000);
    const batches = await Promise.all(
      Array.from({ length: 4 }, () => store.claimDue(now, 3, lease(now)))
    );
    const ids = batches.flat().map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(6);
  });
});
