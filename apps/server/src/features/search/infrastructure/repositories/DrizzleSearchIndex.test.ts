import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { createDb, sql } from "@narbel/db";

import { UnreadableEventError } from "../../../../shared/infrastructure/outbox/OutboxWorker";
import { SearchQuery } from "../../domain/values/SearchQuery";
import { createSearchConsumers } from "../../ioc";
import { DrizzleSearchIndex } from "./DrizzleSearchIndex";

const BASE =
  process.env.DATABASE_URL ??
  "postgresql://postgres:password@localhost:5432/narbel";
const SCHEMA = `search_test_${process.pid}`;
const url = `${BASE}${BASE.includes("?") ? "&" : "?"}options=-c%20search_path%3D${SCHEMA}`;
const admin = createDb({ DATABASE_URL: BASE });
const db = createDb({ DATABASE_URL: url });
const reachable = await admin
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

const q = (raw: string) => {
  const query = SearchQuery.parse(raw);
  if (!query) {
    throw new Error("expected a query");
  }
  return query;
};

const at = (seconds: number) => new Date(seconds * 1000).toISOString();
const texts = (...values: string[]) =>
  values.map((text, i) => ({ pageId: "page:main", elementId: `t${i}`, text }));

describe.skipIf(!reachable)("search mirrors (postgres)", () => {
  const index = new DrizzleSearchIndex(db);
  const consumers = createSearchConsumers({ db });
  const textEvent = (boardId: string, savedAt: string, set: unknown[]) => ({
    type: "event.drawing-text-changed",
    version: 1,
    boardId,
    savedAt,
    texts: set,
  });
  const comment = (
    type: "posted" | "edited",
    commentId: string,
    body: string,
    when: string,
    boardId = "b1"
  ) => ({
    type: `event.comment-${type}`,
    version: 1,
    boardId,
    pageId: "page:main",
    commentId,
    body,
    at: when,
  });
  const deleted = (commentIds: string[], when: string) => ({
    type: "event.comment-deleted",
    version: 1,
    boardId: "b1",
    pageId: "page:main",
    commentIds,
    at: when,
  });
  const find = async (boardIds: string[], raw: string, perBoard = 3) =>
    Object.fromEntries(
      [...(await index.matches(boardIds, q(raw), perBoard))].map(
        ([boardId, matches]) => [
          boardId,
          matches.map((m) => `${m.kind}:${m.text}`),
        ]
      )
    );
  const bodies = async () =>
    Object.fromEntries(
      (
        await db.execute<{ comment_id: string; body: string | null }>(
          sql`select comment_id, body from search_comment order by comment_id`
        )
      ).rows.map((row) => [row.comment_id, row.body])
    );

  beforeAll(async () => {
    await admin.execute(sql.raw(`create schema "${SCHEMA}"`));
    for (const table of [
      "board",
      "board_text",
      "board_text_version",
      "search_comment",
      "processed_event",
    ]) {
      await admin.execute(
        sql.raw(
          `create table "${SCHEMA}".${table} (like public.${table} including all)`
        )
      );
    }
    // LIKE copies no foreign keys; the board cascade is part of what is tested
    for (const table of [
      "board_text",
      "board_text_version",
      "search_comment",
    ]) {
      await admin.execute(
        sql.raw(
          `alter table "${SCHEMA}".${table} add foreign key (board_id) references "${SCHEMA}".board (id) on delete cascade`
        )
      );
    }
    await db.execute(
      sql`insert into board (id, owner_id, title) values ('b1', 'alice', 'One'), ('b2', 'bob', 'Two'), ('gone', 'alice', 'Gone')`
    );
  });
  afterAll(async () => {
    await admin.execute(sql.raw(`drop schema "${SCHEMA}" cascade`));
  });

  it("applies a newer text set, ignores an older one that arrives late, and handles each event once", async () => {
    await consumers.text(
      crypto.randomUUID(),
      textEvent("b1", at(10), texts("launch party", "budget"))
    );
    expect(await find(["b1"], "launch")).toEqual({
      b1: ["text:launch party"],
    });
    const newer = crypto.randomUUID();
    await consumers.text(newer, textEvent("b1", at(20), texts("liftoff")));
    await consumers.text(
      crypto.randomUUID(),
      textEvent("b1", at(15), texts("launch party", "stale"))
    );
    expect(await find(["b1"], "launch")).toEqual({});
    expect(await find(["b1"], "stale")).toEqual({});
    expect(await find(["b1"], "liftoff")).toEqual({ b1: ["text:liftoff"] });
    // a retried delivery is a no-op even where the save time alone would let it apply again
    await consumers.text(crypto.randomUUID(), textEvent("b1", at(30), []));
    await db.execute(sql`delete from board_text_version where board_id = 'b1'`);
    await consumers.text(newer, textEvent("b1", at(20), texts("liftoff")));
    expect(await find(["b1"], "liftoff")).toEqual({});
  });

  it("rewrites only the text rows that changed", async () => {
    await consumers.text(
      crypto.randomUUID(),
      textEvent("b2", at(10), texts("steady", "draft"))
    );
    // xmin changes whenever Postgres writes a new version of the row
    const versions = async () =>
      Object.fromEntries(
        (
          await db.execute<{ element_id: string; v: string }>(
            sql`select element_id, xmin::text as v from board_text where board_id = 'b2'`
          )
        ).rows.map((row) => [row.element_id, row.v])
      );
    const before = await versions();
    await consumers.text(
      crypto.randomUUID(),
      textEvent("b2", at(11), texts("steady", "final"))
    );
    const after = await versions();
    expect(after.t0).toBe(before.t0);
    expect(after.t1).not.toBe(before.t1);
  });

  it("keeps the newest comment edit, drops a deleted thread with its replies, and never brings it back", async () => {
    await consumers.comment(
      crypto.randomUUID(),
      comment("posted", "c1", "Please review the budget", at(10))
    );
    await consumers.comment(
      crypto.randomUUID(),
      comment("posted", "c2", "budget reply", at(11))
    );
    await consumers.comment(
      crypto.randomUUID(),
      comment("edited", "c1", "Please review the costs", at(20))
    );
    // an older edit and a repeated post arrive late
    await consumers.comment(
      crypto.randomUUID(),
      comment("edited", "c1", "old words", at(15))
    );
    await consumers.comment(
      crypto.randomUUID(),
      comment("posted", "c1", "Please review the budget", at(10))
    );
    expect(await find(["b1"], "COSTS")).toEqual({
      b1: ["comment:Please review the costs"],
    });
    expect(await find(["b1"], "budget")).toEqual({
      b1: ["comment:budget reply"],
    });
    await consumers.comment(crypto.randomUUID(), deleted(["c1", "c2"], at(30)));
    await consumers.comment(
      crypto.randomUUID(),
      comment("posted", "c2", "budget reply", at(11))
    );
    await consumers.comment(
      crypto.randomUUID(),
      comment("edited", "c1", "Please review the costs again", at(40))
    );
    expect(await find(["b1"], "budget")).toEqual({});
    expect(await find(["b1"], "costs")).toEqual({});
    expect((await bodies()).c1).toBeNull();
  });

  it("an edit or delete that arrives before its post still ends in the right state", async () => {
    await consumers.comment(
      crypto.randomUUID(),
      comment("edited", "e1", "early edit", at(20))
    );
    await consumers.comment(
      crypto.randomUUID(),
      comment("posted", "e1", "first words", at(10))
    );
    await consumers.comment(crypto.randomUUID(), deleted(["d1"], at(20)));
    await consumers.comment(
      crypto.randomUUID(),
      comment("posted", "d1", "never shown", at(10))
    );
    const rows = await bodies();
    expect(rows.e1).toBe("early edit");
    expect(rows.d1).toBeNull();
  });

  it("matches only the given boards, text before comments, at most perBoard each, Thai and wildcards literal", async () => {
    await consumers.text(
      crypto.randomUUID(),
      textEvent("b2", at(20), texts("สวัสดีชาวโลก", "growth 100% of 1000, a_c"))
    );
    await consumers.comment(
      crypto.randomUUID(),
      comment("posted", "x1", "ชาวโลก comment", at(10), "b2")
    );
    expect(await find(["b1"], "ชาวโลก")).toEqual({});
    expect(await find(["b1", "b2"], "ชาวโลก")).toEqual({
      b2: ["text:สวัสดีชาวโลก", "comment:ชาวโลก comment"],
    });
    expect(await find(["b2"], "ชาวโลก", 1)).toEqual({
      b2: ["text:สวัสดีชาวโลก"],
    });
    expect(await find(["b2"], "100%")).not.toEqual({});
    expect(await find(["b2"], "10%0")).toEqual({});
    expect(await find(["b2"], "a_c")).not.toEqual({});
    expect(await find(["b2"], "a_d")).toEqual({});
  });

  it("takes an event for a purged board as done, and a purge leaves no rows", async () => {
    await consumers.text(
      crypto.randomUUID(),
      textEvent("gone", at(10), texts("bye"))
    );
    await consumers.comment(
      crypto.randomUUID(),
      comment("posted", "g1", "bye", at(10), "gone")
    );
    await db.execute(sql`delete from board where id = 'gone'`);
    const left = await db.execute<{ n: number }>(
      sql`select (select count(*) from board_text where board_id = 'gone')
        + (select count(*) from board_text_version where board_id = 'gone')
        + (select count(*) from search_comment where board_id = 'gone') as n`
    );
    expect(Number(left.rows[0]?.n)).toBe(0);
    // late events for the purged board neither fail nor write
    await consumers.text(
      crypto.randomUUID(),
      textEvent("gone", at(20), texts("ghost"))
    );
    await consumers.comment(
      crypto.randomUUID(),
      comment("edited", "g1", "ghost", at(20), "gone")
    );
    expect(await find(["gone"], "ghost")).toEqual({});
  });

  it("parks a payload it cannot read", async () => {
    await expect(
      consumers.comment(crypto.randomUUID(), { type: "event.comment-posted" })
    ).rejects.toBeInstanceOf(UnreadableEventError);
  });
});
