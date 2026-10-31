import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { createDb, sql } from "@narbel/db";
import * as Y from "yjs";

import { backfillTexts } from "./backfillBoardText";
import { DrizzleBoardDocumentStore } from "./DrizzleBoardDocumentStore";

const BASE =
  process.env.DATABASE_URL ??
  "postgresql://postgres:password@localhost:5432/narbel";
const SCHEMA = `document_store_test_${process.pid}`;
const url = `${BASE}${BASE.includes("?") ? "&" : "?"}options=-c%20search_path%3D${SCHEMA}`;
const admin = createDb({ DATABASE_URL: BASE });
const db = createDb({ DATABASE_URL: url });
const reachable = await admin
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

const textEvents = async (boardId: string) =>
  (
    await db.execute<{ payload: { savedAt: string; texts: unknown[] } }>(
      sql`select payload from outbox where type = 'event.drawing-text-changed' and payload->>'boardId' = ${boardId} order by created_at`
    )
  ).rows.map((row) => row.payload);

describe.skipIf(!reachable)("document saves tell search (postgres)", () => {
  let failEdit = false;
  let woken = 0;
  const store = new DrizzleBoardDocumentStore(
    db,
    () => ({
      findIncludingTrashed: () => Promise.resolve(null),
      markEdited: () =>
        failEdit
          ? Promise.reject(new Error("board row write failed"))
          : Promise.resolve(),
    }),
    () => {
      woken += 1;
    }
  );
  const words = [{ pageId: "page:main", elementId: "t1", text: "hello" }];

  beforeAll(async () => {
    await admin.execute(sql.raw(`create schema "${SCHEMA}"`));
    for (const table of ["board_document", "outbox"]) {
      await admin.execute(
        sql.raw(
          `create table "${SCHEMA}".${table} (like public.${table} including all)`
        )
      );
    }
  });
  afterAll(async () => {
    await admin.execute(sql.raw(`drop schema "${SCHEMA}" cascade`));
  });

  it("publishes the full text set with the save that changed it, and nothing for a save without text", async () => {
    await store.save("b1", new Uint8Array([1]), words);
    await store.save("b1", new Uint8Array([2]));
    const events = await textEvents("b1");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "event.drawing-text-changed",
      version: 1,
      boardId: "b1",
      texts: words,
    });
    expect(Number.isNaN(Date.parse(events[0]?.savedAt ?? ""))).toBe(false);
    expect(woken).toBeGreaterThan(0);
  });

  it("publishes nothing when the save rolls back", async () => {
    failEdit = true;
    await expect(
      store.save("b2", new Uint8Array([1]), words)
    ).rejects.toThrow();
    failEdit = false;
    expect(await textEvents("b2")).toEqual([]);
    expect(await store.load("b2")).toBeNull();
  });

  it("backfills a full text event per board saved before search was told, once", async () => {
    const doc = new Y.Doc();
    doc
      .getMap("elements")
      .set("page:main:t1", { id: "t1", type: "text", text: "legacy words" });
    await db.execute(
      sql`insert into board_document (board_id, state) values ('old', ${Buffer.from(Y.encodeStateAsUpdate(doc))})`
    );
    expect(await backfillTexts(db)).toBe(1);
    expect(await backfillTexts(db)).toBe(0);
    const events = await textEvents("old");
    expect(events.map((e) => e.texts)).toEqual([
      [{ pageId: "page:main", elementId: "t1", text: "legacy words" }],
    ]);
  });
});
