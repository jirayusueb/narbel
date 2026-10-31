import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { createDb, eq, sql } from "@narbel/db";
import { board, boardAccess } from "@narbel/db/schema/boards";

import { DrizzleBoardAccessRepository } from "./DrizzleBoardAccessRepository";

const BASE =
  process.env.DATABASE_URL ??
  "postgresql://postgres:password@localhost:5432/narbel";
const SCHEMA = `access_repo_test_${process.pid}`;
const url = `${BASE}${BASE.includes("?") ? "&" : "?"}options=-c%20search_path%3D${SCHEMA}`;
const admin = createDb({ DATABASE_URL: BASE });
const db = createDb({ DATABASE_URL: url });
const registered = [{ id: "ann", email: "ann@x.io", name: "Ann" }];
const repo = new DrizzleBoardAccessRepository(db, {
  findByEmails: (emails) =>
    Promise.resolve(registered.filter((p) => emails.includes(p.email))),
});
const reachable = await admin
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

const alice = { id: "alice", email: "alice@x.io" };

describe.skipIf(!reachable)("DrizzleBoardAccessRepository (postgres)", () => {
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

  it("lists owned, invited and claimed boards once each, with current titles and roles, nothing else", async () => {
    const readable = await repo.readableBoards(alice);
    const byId = new Map(readable.map((b) => [b.id, [b.title, b.role]]));
    expect(readable).toHaveLength(byId.size);
    expect(byId.get("own")).toEqual(["Owned", "owner"]);
    expect(byId.get("granted")).toEqual(["Granted", "viewer"]);
    expect(byId.get("claimed")).toEqual(["Claimed", "editor"]);
    expect(byId.get("renamed")).toEqual(["New title", "owner"]);
    expect(byId.has("stranger")).toBe(false);
  });

  it("hides a trashed board until it is restored", async () => {
    const ids = async () => (await repo.readableBoards(alice)).map((b) => b.id);
    expect(await ids()).not.toContain("trash");
    await db
      .update(board)
      .set({ trashedAt: null })
      .where(eq(board.id, "trash"));
    expect(await ids()).toContain("trash");
  });

  it("reads an invitation without claiming it, and a claim never replaces the person", async () => {
    const invite = await repo.findGrant("granted", {
      userId: alice.id,
      email: "Alice@x.io",
    });
    expect(invite).toEqual({ grantId: "ga1", userId: null, role: "viewer" });
    expect(
      (await repo.findGrant("granted", { userId: alice.id, email: undefined }))
        ?.grantId
    ).toBeUndefined();
    await repo.claim("ga1", alice.id);
    await repo.claim("ga1", "mallory");
    expect(
      await repo.findGrant("granted", { userId: alice.id, email: undefined })
    ).toEqual({ grantId: "ga1", userId: alice.id, role: "viewer" });
  });

  it("names members through identity, falls back to the email without an account, and resolves unclaimed invites", async () => {
    await db.insert(boardAccess).values([
      { id: "m1", boardId: "stranger", email: "ann@x.io", role: "editor" },
      { id: "m2", boardId: "stranger", email: "ghost@x.io", role: "viewer" },
    ]);
    const members = await repo.listMembers("stranger");
    expect(members.toSorted((a, b) => a.email.localeCompare(b.email))).toEqual([
      { userId: null, email: "ann@x.io", role: "editor", name: "Ann" },
      { userId: null, email: "ghost@x.io", role: "viewer", name: "ghost@x.io" },
    ]);
    expect(await repo.listMemberRoles("stranger")).toEqual([
      { userId: "ann", role: "editor" },
    ]);
    expect(await repo.findUserIdByEmail("ann@x.io")).toBe("ann");
    expect(await repo.findUserIdByEmail("ghost@x.io")).toBeNull();
  });
});
