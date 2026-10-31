import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { createDb, eq, sql } from "@narbel/db";
import { board, boardAccess } from "@narbel/db/schema/board";

import { readableBoards } from "./ReadableBoards";

const BASE =
  process.env.DATABASE_URL ??
  "postgresql://postgres:password@localhost:5432/narbel";
const SCHEMA = `readable_test_${process.pid}`;
const url = `${BASE}${BASE.includes("?") ? "&" : "?"}options=-c%20search_path%3D${SCHEMA}`;
const admin = createDb({ DATABASE_URL: BASE });
const db = createDb({ DATABASE_URL: url });
const reachable = await admin
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

const alice = { id: "alice", email: "alice@x.io" };

describe.skipIf(!reachable)("readableBoards (postgres)", () => {
  beforeAll(async () => {
    await admin.execute(sql.raw(`create schema "${SCHEMA}"`));
    for (const table of ["board", "board_access"]) {
      await admin.execute(
        sql.raw(
          `create table "${SCHEMA}".${table} (like public.${table} including all)`
        )
      );
    }
    await db.insert(board).values([
      { id: "own", ownerId: alice.id, title: "Owned" },
      { id: "granted", ownerId: "bob", title: "Granted" },
      { id: "claimed", ownerId: "bob", title: "Claimed" },
      { id: "renamed", ownerId: alice.id, title: "New title" },
      {
        id: "trash",
        ownerId: alice.id,
        title: "Trashed",
        trashedAt: new Date(),
      },
      { id: "stranger", ownerId: "bob", title: "Stranger" },
    ]);
    await db.insert(boardAccess).values([
      { id: "ga1", boardId: "granted", email: alice.email, role: "viewer" },
      {
        id: "ga2",
        boardId: "claimed",
        userId: alice.id,
        email: alice.email,
        role: "editor",
      },
    ]);
  });
  afterAll(async () => {
    await admin.execute(sql.raw(`drop schema "${SCHEMA}" cascade`));
  });

  it("lists owned, invited and claimed boards with current titles, nothing else", async () => {
    const titles = await readableBoards(db, alice);
    expect(titles.get("own")).toBe("Owned");
    expect(titles.get("granted")).toBe("Granted");
    expect(titles.get("claimed")).toBe("Claimed");
    expect(titles.get("renamed")).toBe("New title");
    expect(titles.has("stranger")).toBe(false);
  });

  it("hides a trashed board until it is restored", async () => {
    expect((await readableBoards(db, alice)).has("trash")).toBe(false);
    await db
      .update(board)
      .set({ trashedAt: null })
      .where(eq(board.id, "trash"));
    expect((await readableBoards(db, alice)).has("trash")).toBe(true);
  });
});
