import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

import { createDb, eq, sql } from "@narbel/db";
import {
  board,
  boardDocument,
  boardFile,
  boardVersion,
} from "@narbel/db/schema/board";
import * as Y from "yjs";

import type { IFileStorage } from "../../../../shared/application/interfaces/IFileStorage";
import type { IBoardPresence } from "../../application/ports/IBoardPresence";
import { DrizzleBoardFileRepository } from "../repositories/DrizzleBoardFileRepository";
import { GRACE_MS, sweepBoardFiles } from "./sweepBoardFiles";

const BASE =
  process.env.DATABASE_URL ??
  "postgresql://postgres:password@localhost:5432/narbel";
const SCHEMA = `board_gc_test_${process.pid}`;
const url = `${BASE}${BASE.includes("?") ? "&" : "?"}options=-c%20search_path%3D${SCHEMA}`;
const admin = createDb({ DATABASE_URL: BASE });
const db = createDb({ DATABASE_URL: url });
const reachable = await admin
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

const NOW = new Date(Date.UTC(2026, 5, 1));
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

const stateOf = (elements: Record<string, Record<string, unknown>>) => {
  const doc = new Y.Doc();
  for (const [key, element] of Object.entries(elements)) {
    doc.getMap("elements").set(key, element);
  }
  return Y.encodeStateAsUpdate(doc);
};
const image = (fileId: string, isDeleted = false) => ({
  type: "image",
  fileId,
  isDeleted,
});

class FakeStorage implements IFileStorage {
  objects = new Set<string>();
  failDeletes = 0;
  put = () => Promise.resolve();
  stream = () => new ReadableStream<Uint8Array>();
  stat = () => Promise.resolve(null);
  deletePrefix = () => Promise.resolve();
  presignUpload = () => "";
  delete(key: string) {
    if (this.failDeletes > 0) {
      this.failDeletes -= 1;
      return Promise.reject(new Error("s3 down"));
    }
    this.objects.delete(key);
    return Promise.resolve();
  }
}

describe.skipIf(!reachable)("board file GC (postgres)", () => {
  const storage = new FakeStorage();
  const files = new DrizzleBoardFileRepository(db);
  let onPresence: () => Promise<void> = () => Promise.resolve();
  let viewers = 0;
  let outage = false;
  // list() mirrors RedisBoardPresence: an outage reads as an empty room. countStrict() rejects instead.
  const presence: IBoardPresence = {
    join: () => Promise.resolve(),
    leave: () => Promise.resolve(),
    list: async () => {
      await onPresence();
      return outage
        ? []
        : Array.from({ length: viewers }, () => ({ userId: "u", name: null }));
    },
    countStrict: async () => {
      await onPresence();
      if (outage) {
        throw new Error("redis down");
      }
      return viewers;
    },
  };
  const sweep = () =>
    sweepBoardFiles({ db, storage, presence, now: () => NOW });

  const seedBoard = async (
    id: string,
    elements: Record<string, Record<string, unknown>>,
    opts: { idleDays?: number; trashed?: boolean } = {}
  ) => {
    const at = daysAgo(opts.idleDays ?? 90);
    await db.insert(board).values({
      id,
      ownerId: "u1",
      title: id,
      createdAt: at,
      updatedAt: at,
      trashedAt: opts.trashed ? daysAgo(10) : null,
    });
    await db
      .insert(boardDocument)
      .values({ boardId: id, state: stateOf(elements), updatedAt: at });
  };
  const seedFile = async (
    boardId: string,
    fileId: string,
    orphanDays: number | null,
    touchedDays = 90
  ) => {
    await db.insert(boardFile).values({
      boardId,
      fileId,
      mimeType: "image/png",
      size: 1,
      touchedAt: daysAgo(touchedDays),
      orphanSince: orphanDays === null ? null : daysAgo(orphanDays),
    });
    storage.objects.add(`boards/${boardId}/${fileId}`);
  };
  const rowOf = async (boardId: string, fileId: string) =>
    (
      await db.select().from(boardFile).where(eq(boardFile.fileId, fileId))
    ).find((r) => r.boardId === boardId);
  const kept = (boardId: string, fileId: string) =>
    storage.objects.has(`boards/${boardId}/${fileId}`);

  beforeAll(async () => {
    await admin.execute(sql.raw(`create schema "${SCHEMA}"`));
    for (const table of [
      "board",
      "board_document",
      "board_version",
      "board_file",
    ]) {
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
  beforeEach(async () => {
    for (const table of [boardFile, boardVersion, boardDocument, board]) {
      await db.delete(table);
    }
    storage.objects.clear();
    storage.failDeletes = 0;
    onPresence = () => Promise.resolve();
    viewers = 0;
    outage = false;
  });

  it("deletes an orphan unreferenced for 30 days on an idle board, and its row", async () => {
    await seedBoard("b1", {});
    await seedFile("b1", "f1", 31);
    await sweep();
    expect(kept("b1", "f1")).toBe(false);
    expect(await rowOf("b1", "f1")).toBeUndefined();
  });

  it("marks a newly unreferenced file now and waits the full grace", async () => {
    await seedBoard("b1", {});
    await seedFile("b1", "f1", null);
    await sweep();
    expect((await rowOf("b1", "f1"))?.orphanSince).toEqual(NOW);
    expect(kept("b1", "f1")).toBe(true);
  });

  it("keeps an orphan marked 29 days ago", async () => {
    await seedBoard("b1", {});
    await seedFile("b1", "f1", 29);
    await sweep();
    expect(kept("b1", "f1")).toBe(true);
    expect((await rowOf("b1", "f1"))?.state).toBe("live");
  });

  it("keeps files on live elements, and tombstoned ones are not references", async () => {
    await seedBoard("b1", { "p:a": image("used"), "p:b": image("gone", true) });
    await seedFile("b1", "used", 40);
    await seedFile("b1", "gone", 40);
    await sweep();
    expect(kept("b1", "used")).toBe(true);
    expect((await rowOf("b1", "used"))?.orphanSince).toBeNull();
    expect(kept("b1", "gone")).toBe(false);
  });

  it("ignores the Yjs files map: metadata alone does not keep a file", async () => {
    const doc = new Y.Doc();
    doc.getMap("files").set("meta-only", { id: "meta-only" });
    await seedBoard("b1", {});
    await db.update(boardDocument).set({ state: Y.encodeStateAsUpdate(doc) });
    await seedFile("b1", "meta-only", 40);
    await sweep();
    expect(kept("b1", "meta-only")).toBe(false);
  });

  it("keeps a file only a retained version references", async () => {
    await seedBoard("b1", {});
    await db.insert(boardVersion).values({
      id: "v1",
      boardId: "b1",
      kind: "auto",
      state: stateOf({}),
      fileIds: ["old"],
      createdAt: daysAgo(5),
    });
    await seedFile("b1", "old", 40);
    await sweep();
    expect(kept("b1", "old")).toBe(true);
    expect((await rowOf("b1", "old"))?.orphanSince).toBeNull();
  });

  it("clears the mark when an orphan is referenced again", async () => {
    await seedBoard("b1", { "p:a": image("f1") });
    await seedFile("b1", "f1", 10);
    await sweep();
    expect((await rowOf("b1", "f1"))?.orphanSince).toBeNull();
  });

  it("leaves trashed boards alone and restarts their grace", async () => {
    await seedBoard("b1", {}, { trashed: true });
    await seedFile("b1", "f1", 40);
    await sweep();
    expect(kept("b1", "f1")).toBe(true);
    expect((await rowOf("b1", "f1"))?.orphanSince).toBeNull();
  });

  it("leaves boards active within the grace, and boards with a viewer", async () => {
    await seedBoard("recent", {}, { idleDays: 3 });
    await seedFile("recent", "f1", 40);
    await seedBoard("watched", {});
    await seedFile("watched", "f2", 40);
    viewers = 1;
    await sweep();
    expect(kept("recent", "f1")).toBe(true);
    expect(kept("watched", "f2")).toBe(true);
  });

  it("skips boards with a missing or undecodable document", async () => {
    await seedBoard("nodoc", {});
    await db.delete(boardDocument);
    await seedFile("nodoc", "f1", 40);
    await seedBoard("garbage", {});
    await db
      .update(boardDocument)
      .set({ state: new Uint8Array([255, 255, 255]) });
    await seedFile("garbage", "f2", 40);
    await sweep();
    expect(kept("nodoc", "f1")).toBe(true);
    expect(kept("garbage", "f2")).toBe(true);
  });

  it("scopes references to their own board when fileIds repeat", async () => {
    await seedBoard("a", { "p:a": image("same") });
    await seedBoard("b", {});
    await seedFile("a", "same", null);
    await seedFile("b", "same", 40);
    await sweep();
    expect(kept("a", "same")).toBe(true);
    expect(kept("b", "same")).toBe(false);
  });

  it("does not claim a file touched by an upload inside the grace", async () => {
    await seedBoard("b1", {});
    await seedFile("b1", "f1", 40, 90);
    expect(
      await files.save("b1", { id: "f1", mimeType: "image/png", size: 1 })
    ).toBe(true);
    await sweep();
    expect(kept("b1", "f1")).toBe(true);
    expect((await rowOf("b1", "f1"))?.state).toBe("live");
  });

  it("never lets an upload write a row the GC has claimed", async () => {
    await seedBoard("b1", {});
    await seedFile("b1", "f1", 40);
    let registered: boolean | undefined;
    // runs between the claim and the delete
    onPresence = async () => {
      if ((await rowOf("b1", "f1"))?.state === "deleting") {
        registered = await files.save("b1", {
          id: "f1",
          mimeType: "image/png",
          size: 1,
        });
        expect(await files.findById("b1", "f1")).toBeNull();
      }
    };
    await sweep();
    expect(registered).toBe(false);
    expect(kept("b1", "f1")).toBe(false);
    expect(await rowOf("b1", "f1")).toBeUndefined();
  });

  it("keeps the bytes when a reference lands between claim and delete", async () => {
    await seedBoard("b1", {});
    await seedFile("b1", "f1", 40);
    onPresence = async () => {
      if ((await rowOf("b1", "f1"))?.state === "deleting") {
        await db
          .update(boardDocument)
          .set({ state: stateOf({ "p:a": image("f1") }) });
      }
    };
    await sweep();
    const row = await rowOf("b1", "f1");
    expect(kept("b1", "f1")).toBe(true);
    expect(row?.state).toBe("live");
    expect(row?.orphanSince).toBeNull();
  });

  it("requeues after a failed S3 delete and removes the row only on success", async () => {
    await seedBoard("b1", {});
    await seedFile("b1", "f1", 40);
    storage.failDeletes = 1;
    await sweep();
    const row = await rowOf("b1", "f1");
    expect(kept("b1", "f1")).toBe(true);
    expect(row?.state).toBe("live");
    expect(row?.orphanSince).not.toBeNull();
    await sweep();
    expect(kept("b1", "f1")).toBe(false);
    expect(await rowOf("b1", "f1")).toBeUndefined();
  });

  it("hands back a claim a crashed sweep left behind, then collects it", async () => {
    await seedBoard("b1", {});
    await seedFile("b1", "f1", 40);
    await db.update(boardFile).set({
      state: "deleting",
      claimedAt: new Date(NOW.getTime() - 3_600_000),
    });
    await sweep();
    expect(kept("b1", "f1")).toBe(false);
    expect(await rowOf("b1", "f1")).toBeUndefined();
  });

  it("does not touch a fresh claim another replica holds", async () => {
    await seedBoard("b1", {});
    await seedFile("b1", "f1", 40);
    await db
      .update(boardFile)
      .set({ state: "deleting", claimedAt: new Date(NOW.getTime() - 60_000) });
    await sweep();
    expect(kept("b1", "f1")).toBe(true);
    expect((await rowOf("b1", "f1"))?.state).toBe("deleting");
  });

  it("deletes nothing while presence is unreachable", async () => {
    await seedBoard("b1", {});
    await seedFile("b1", "f1", 40);
    outage = true;
    await sweep();
    expect(kept("b1", "f1")).toBe(true);
    expect((await rowOf("b1", "f1"))?.state).toBe("live");
    outage = false;
    await sweep();
    expect(kept("b1", "f1")).toBe(false);
  });

  it("does not reclaim an outage-time claim: a stale claim is rechecked, not blindly deleted or revived", async () => {
    await seedBoard("b1", {});
    await seedFile("b1", "f1", 40);
    await db.update(boardFile).set({
      state: "deleting",
      claimedAt: new Date(NOW.getTime() - 3_600_000),
    });
    outage = true;
    await sweep();
    expect(kept("b1", "f1")).toBe(true);
    expect((await rowOf("b1", "f1"))?.state).toBe("live");
  });

  it("hands a stale claim back live when the file became referenced", async () => {
    await seedBoard("b1", { "p:a": image("f1") });
    await seedFile("b1", "f1", 40);
    await db.update(boardFile).set({
      state: "deleting",
      claimedAt: new Date(NOW.getTime() - 3_600_000),
    });
    await sweep();
    const row = await rowOf("b1", "f1");
    expect(kept("b1", "f1")).toBe(true);
    expect(row?.state).toBe("live");
    expect(row?.orphanSince).toBeNull();
  });

  it("uses a 30 day grace", () => {
    expect(GRACE_MS).toBe(30 * 86_400_000);
  });
});
