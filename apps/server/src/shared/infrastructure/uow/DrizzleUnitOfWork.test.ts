import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { createDb, eq, sql } from "@narbel/db";
import { outbox } from "@narbel/db/schema/account";

import { err, ok } from "../../kernel/types/Result";
import { UuidGenerator } from "../ids/UuidGenerator";
import { DrizzleOutbox } from "../outbox/DrizzleOutbox";
import { DrizzleUnitOfWork } from "./DrizzleUnitOfWork";

const BASE =
  process.env.DATABASE_URL ??
  "postgresql://postgres:password@localhost:5432/narbel";
const SCHEMA = `uow_test_${process.pid}`;
const url = `${BASE}${BASE.includes("?") ? "&" : "?"}options=-c%20search_path%3D${SCHEMA}`;
const admin = createDb({ DATABASE_URL: BASE });
const db = createDb({ DATABASE_URL: url });
const reachable = await admin
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!reachable)("DrizzleUnitOfWork (postgres)", () => {
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

  const uow = new DrizzleUnitOfWork(db, (tx, afterCommit) => ({
    outbox: new DrizzleOutbox(tx, new UuidGenerator()),
    afterCommit,
  }));
  const mail = {
    type: "email.mentioned" as const,
    to: "a@x.io",
    boardId: "b",
    commentId: "c",
    actorName: "A",
    excerpt: "x",
  };
  const count = async (key: string) =>
    (await db.select().from(outbox).where(eq(outbox.dedupeKey, key))).length;

  it("commits the writes and runs after-commit hooks only then", async () => {
    const seen: string[] = [];
    const result = await uow.run(async (tx) => {
      await tx.outbox.enqueue(mail, "commit");
      tx.afterCommit(() => {
        seen.push("hook");
      });
      expect(seen).toEqual([]);
      return ok("done");
    });
    expect(result.isOk()).toBe(true);
    expect(await count("commit")).toBe(1);
    expect(seen).toEqual(["hook"]);
  });

  it("rolls everything back when the work returns an Err, without running hooks", async () => {
    const seen: string[] = [];
    const result = await uow.run(async (tx) => {
      await tx.outbox.enqueue(mail, "err");
      tx.afterCommit(() => {
        seen.push("hook");
      });
      return err("nope");
    });
    expect(result.isErr()).toBe(true);
    expect(await count("err")).toBe(0);
    expect(seen).toEqual([]);
  });

  it("rolls back when the work throws and rethrows", async () => {
    await expect(
      uow.run(async (tx) => {
        await tx.outbox.enqueue(mail, "throw");
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(await count("throw")).toBe(0);
  });
});
