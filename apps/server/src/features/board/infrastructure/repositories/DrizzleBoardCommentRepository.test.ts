import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { createDb, sql } from "@narbel/db";
import { comment } from "@narbel/db/schema/board";

import { DrizzleBoardCommentRepository } from "./DrizzleBoardCommentRepository";

const BASE =
  process.env.DATABASE_URL ??
  "postgresql://postgres:password@localhost:5432/narbel";
const SCHEMA = `comment_activity_test_${process.pid}`;
const url = `${BASE}${BASE.includes("?") ? "&" : "?"}options=-c%20search_path%3D${SCHEMA}`;
const admin = createDb({ DATABASE_URL: BASE });
const db = createDb({ DATABASE_URL: url });
const reachable = await admin
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

const t = (seconds: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds));

const row = (
  id: string,
  boardId: string,
  patch: Partial<typeof comment.$inferInsert> = {}
) => ({
  id,
  boardId,
  pageId: "page:main",
  x: 0,
  y: 0,
  body: `body ${id}`,
  authorId: "u1",
  createdAt: t(0),
  ...patch,
});

describe.skipIf(!reachable)("comment activity (postgres)", () => {
  const repo = new DrizzleBoardCommentRepository(db);
  beforeAll(async () => {
    await admin.execute(sql.raw(`create schema "${SCHEMA}"`));
    for (const table of ["comment", "comment_reaction"]) {
      await admin.execute(
        sql.raw(
          `create table "${SCHEMA}".${table} (like public.${table} including all)`
        )
      );
    }
    await db
      .insert(comment)
      .values([
        row("untouched", "b1", { createdAt: t(1) }),
        row("edited", "b1", { createdAt: t(2), editedAt: t(30) }),
        row("resolved", "b1", { createdAt: t(3), resolvedAt: t(20) }),
        row("reply", "b1", { createdAt: t(25), parentId: "untouched" }),
        row("other-board", "b2", { createdAt: t(40) }),
      ]);
  });
  afterAll(async () => {
    await admin.execute(sql.raw(`drop schema "${SCHEMA}" cascade`));
  });

  const ids = async (after: Date, afterId = "", limit = 10) =>
    (
      await repo.listActivity({
        boardId: "b1",
        after: { at: after, id: afterId },
        limit,
      })
    ).map((a) => a.comment.id);

  it("returns edits and resolves of old comments, oldest activity first, on this board only", async () => {
    expect(await ids(t(10))).toEqual(["resolved", "reply", "edited"]);
  });

  it("reports creation as activity and excludes rows at or before the cursor", async () => {
    expect(await ids(t(0))).toEqual([
      "untouched",
      "resolved",
      "reply",
      "edited",
    ]);
    expect(await ids(t(30), "edited")).toEqual([]);
  });

  it("breaks ties on id and resumes after a (time, id) cursor", async () => {
    expect(await ids(t(20), "resolved")).toEqual(["reply", "edited"]);
    expect(await ids(t(10), "", 2)).toEqual(["resolved", "reply"]);
  });

  it("exposes the activity time of each row", async () => {
    const [first] = await repo.listActivity({
      boardId: "b1",
      after: { at: t(10), id: "" },
      limit: 1,
    });
    expect(first?.activityAt).toEqual(t(20));
  });
});
