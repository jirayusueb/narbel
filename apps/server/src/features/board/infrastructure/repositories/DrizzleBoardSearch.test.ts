import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { createDb, sql } from "@narbel/db";
import { board, boardAccess, comment } from "@narbel/db/schema/board";
import * as Y from "yjs";

import { SearchQuery } from "../../domain/values/SearchQuery";
import { extractBoardText } from "../crdt/boardText";
import { DrizzleBoardDocumentStore } from "./DrizzleBoardDocumentStore";
import { DrizzleBoardSearch } from "./DrizzleBoardSearch";

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

const text = (id: string, value: string) => ({ id, type: "text", text: value });

const docOf = (elements: Record<string, Record<string, unknown>>) => {
  const doc = new Y.Doc();
  for (const [key, element] of Object.entries(elements)) {
    doc.getMap("elements").set(key, element);
  }
  return doc;
};

const alice = { id: "alice", email: "alice@x.io" };
const q = (raw: string) => {
  const query = SearchQuery.parse(raw);
  if (!query) {
    throw new Error("expected a query");
  }
  return query;
};

describe.skipIf(!reachable)("board search (postgres)", () => {
  const store = new DrizzleBoardDocumentStore(db);
  const search = new DrizzleBoardSearch(db);
  const put = (
    boardId: string,
    elements: Record<string, Record<string, unknown>>
  ) => {
    const doc = docOf(elements);
    return store.save(
      boardId,
      Y.encodeStateAsUpdate(doc),
      extractBoardText(doc)
    );
  };
  const find = async (user: typeof alice, raw: string) =>
    (await search.search(user, q(raw), 20, 3)).map((hit) => ({
      id: hit.board.id,
      matches: hit.matches.map((m) => `${m.kind}:${m.text}`),
    }));
  beforeAll(async () => {
    await admin.execute(sql.raw(`create schema "${SCHEMA}"`));
    for (const table of [
      "board",
      "board_access",
      "board_text",
      "board_document",
      "comment",
    ]) {
      await admin.execute(
        sql.raw(
          `create table "${SCHEMA}".${table} (like public.${table} including all)`
        )
      );
    }
    const now = new Date();
    await db.insert(board).values([
      {
        id: "a1",
        ownerId: "alice",
        title: "Roadmap",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "b1",
        ownerId: "bob",
        title: "Secret plan",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "b2",
        ownerId: "bob",
        title: "Shared plan",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "a2",
        ownerId: "alice",
        title: "Rates",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.insert(boardAccess).values({
      id: "g1",
      boardId: "b2",
      userId: "alice",
      email: "alice@x.io",
      role: "viewer",
    });
    await db.insert(comment).values({
      id: "c1",
      boardId: "b2",
      pageId: "page:main",
      x: 0,
      y: 0,
      body: "Please review the budget",
      authorId: "bob",
    });
    await put("a1", { "page:two:t1": text("t1", "สวัสดีชาวโลก") });
    await put("a2", { "page:main:t1": text("t1", "growth 100% of 1000, a_c") });
    await put("b1", { "page:main:t1": text("t1", "launch codes") });
    await put("b2", { "page:main:t1": text("t1", "launch party") });
  });
  afterAll(async () => {
    await admin.execute(sql.raw(`drop schema "${SCHEMA}" cascade`));
  });

  it("never returns text from a board the user cannot read", async () => {
    expect(await find(alice, "codes")).toEqual([]);
    expect(await find(alice, "secret")).toEqual([]);
  });

  it("returns a board shared with the user, matching its text and comments", async () => {
    expect(await find(alice, "launch")).toEqual([
      { id: "b2", matches: ["text:launch party"] },
    ]);
    expect(await find(alice, "BUDGET")).toEqual([
      { id: "b2", matches: ["comment:Please review the budget"] },
    ]);
  });

  it("matches Thai substrings without word boundaries", async () => {
    expect(await find(alice, "ชาวโลก")).toEqual([
      { id: "a1", matches: ["text:สวัสดีชาวโลก"] },
    ]);
  });

  it("treats LIKE wildcards in the query literally", async () => {
    expect(await find(alice, "100%")).toHaveLength(1);
    expect(await find(alice, "10%0")).toEqual([]);
    expect(await find(alice, "a_c")).toHaveLength(1);
    expect(await find(alice, "a_d")).toEqual([]);
  });

  it("orders title matches before newer text matches", async () => {
    const ids = (await find(alice, "plan")).map((hit) => hit.id);
    expect(ids).toEqual(["b2"]);
    await put("a1", { "page:main:t1": text("t1", "plan B") });
    const both = await find(alice, "plan");
    expect(both.map((hit) => hit.id)).toEqual(["b2", "a1"]);
  });

  it("backfills boards saved before search existed, once", async () => {
    const state = Y.encodeStateAsUpdate(
      docOf({ "page:main:t1": text("t1", "legacy words") })
    );
    await db
      .insert(board)
      .values({ id: "old", ownerId: "alice", title: "Old" });
    await db.execute(
      sql`insert into board_document (board_id, state) values ('old', ${Buffer.from(state)})`
    );
    expect(await find(alice, "legacy")).toEqual([]);
    expect(await store.backfillTexts()).toBe(1);
    expect((await find(alice, "legacy")).map((hit) => hit.id)).toEqual(["old"]);
    expect(await store.backfillTexts()).toBe(0);
  });
});
