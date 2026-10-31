import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { createDb, sql } from "@narbel/db";
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
      { id: "renamed", ownerId: alice.id, title: "New title" },
      { id: "stranger", ownerId: "bob", title: "Stranger" },
    ]);
    await db
      .insert(boardAccess)
      .values([
        { id: "ga1", boardId: "granted", email: alice.email, role: "viewer" },
      ]);
  });
  afterAll(async () => {
    await admin.execute(sql.raw(`drop schema "${SCHEMA}" cascade`));
  });

  it("lists owned and granted boards with current titles, nothing else", async () => {
    const titles = await readableBoards(db, alice);
    expect(titles.get("own")).toBe("Owned");
    expect(titles.get("granted")).toBe("Granted");
    expect(titles.get("renamed")).toBe("New title");
    expect(titles.has("stranger")).toBe(false);
  });

  it("matches a claimed grant by user id too", async () => {
    await db.insert(boardAccess).values({
      id: "ga2",
      boardId: "stranger",
      userId: alice.id,
      email: alice.email,
      role: "editor",
    });
    const titles = await readableBoards(db, alice);
    expect(titles.has("stranger")).toBe(true);
  });
});
