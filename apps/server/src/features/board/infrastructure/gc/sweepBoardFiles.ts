import { and, eq, inArray, isNotNull, isNull, lt, lte } from "@narbel/db";
import type { Database } from "@narbel/db";
import {
  board,
  boardDocument,
  boardFile,
  boardVersion,
} from "@narbel/db/schema/board";
import * as Y from "yjs";

import type { IFileStorage } from "../../../../shared/application/interfaces/IFileStorage";
import type { ExcalidrawElement } from "../../application/dtos/ExcalidrawElement";
import type { IBoardPresence } from "../../application/ports/IBoardPresence";
import { boardFileKey } from "../../domain/values/FileKey";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** An image must stay unreferenced this long, on a board idle this long, before its bytes go. */
export const GRACE_MS = 30 * DAY;
export const CLAIM_LEASE_MS = 15 * MINUTE;

const SWEEP_CONCURRENCY = 3;

const runBounded = async <T>(
  items: readonly T[],
  run: (item: T) => Promise<void>
) => {
  let next = 0;
  const failures: unknown[] = [];
  const worker = async (): Promise<void> => {
    const index = next;
    next += 1;
    if (index >= items.length) {
      return;
    }
    try {
      await run(items[index] as T);
      await worker();
    } catch (error) {
      failures.push(error);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(SWEEP_CONCURRENCY, items.length) }, worker)
  );
  if (failures.length > 0) {
    throw failures[0];
  }
};

interface Deps {
  db: Database;
  storage: IFileStorage;
  presence: IBoardPresence;
  now?: () => Date;
}

interface Snapshot {
  referenced: Set<string>;
  idleSince: Date;
}

/**
 * What a board keeps: images on live (not deleted) elements of the stored document, plus every
 * image any retained version lists. "trashed" and "uncertain" (no board, no document, or one that
 * does not decode) mean the sweep must leave the board's files alone.
 */
const snapshotOf = async (
  db: Database,
  boardId: string
): Promise<Snapshot | "trashed" | "uncertain"> => {
  const [row] = await db
    .select({
      trashedAt: board.trashedAt,
      updatedAt: board.updatedAt,
      state: boardDocument.state,
      documentUpdatedAt: boardDocument.updatedAt,
    })
    .from(board)
    .leftJoin(boardDocument, eq(boardDocument.boardId, board.id))
    .where(eq(board.id, boardId))
    .limit(1);
  if (!row) {
    return "uncertain";
  }
  if (row.trashedAt) {
    return "trashed";
  }
  if (!(row.state && row.documentUpdatedAt)) {
    return "uncertain";
  }
  const referenced = new Set<string>();
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, row.state);
    for (const element of doc.getMap<ExcalidrawElement>("elements").values()) {
      if (!element.isDeleted && typeof element.fileId === "string") {
        referenced.add(element.fileId);
      }
    }
  } catch {
    return "uncertain";
  } finally {
    doc.destroy();
  }
  const versions = await db
    .select({ fileIds: boardVersion.fileIds })
    .from(boardVersion)
    .where(eq(boardVersion.boardId, boardId));
  for (const version of versions) {
    for (const id of version.fileIds) {
      referenced.add(id);
    }
  }
  return {
    referenced,
    idleSince: new Date(
      Math.max(row.updatedAt.getTime(), row.documentUpdatedAt.getTime())
    ),
  };
};

type Reclaim = Pick<Deps, "db" | "storage" | "presence" | "now">;

/** True only when the store answered and nobody is connected; an outage is "not empty". */
const isEmpty = async (presence: IBoardPresence, boardId: string) => {
  try {
    return (await presence.countStrict(boardId)) === 0;
  } catch (error) {
    console.error(
      `Presence unavailable for ${boardId}, keeping its files`,
      error
    );
    return false;
  }
};

/**
 * Runs the last checks and the delete for a file this sweep owns (`claimedAt` identifies the claim).
 * Every doubt, including an unreachable presence store, hands the file back with its bytes intact.
 */
const finish = async (
  { db, storage, presence, now = () => new Date() }: Reclaim,
  boardId: string,
  fileId: string,
  claimedAt: Date
) => {
  const mine = and(
    eq(boardFile.boardId, boardId),
    eq(boardFile.fileId, fileId),
    eq(boardFile.state, "deleting"),
    eq(boardFile.claimedAt, claimedAt)
  );
  const release = (referenced: boolean) =>
    db
      .update(boardFile)
      .set({
        state: "live",
        claimedAt: null,
        ...(referenced ? { orphanSince: null } : {}),
      })
      .where(mine);

  // Last look, as close to the delete as the stores allow: anyone connected, then any new write or reference.
  // shortcut: reads persisted state only. A client that connects after the presence read and syncs a
  // reference to this file before the delete is not seen (no document lock); the window is milliseconds
  // and needs a client offline for the whole grace.
  if (!(await isEmpty(presence, boardId))) {
    await release(false);
    return;
  }
  const again = await snapshotOf(db, boardId);
  if (typeof again === "string") {
    await release(false);
    return;
  }
  if (again.referenced.has(fileId)) {
    await release(true);
    return;
  }
  if (now().getTime() - again.idleSince.getTime() < GRACE_MS) {
    await release(false);
    return;
  }
  try {
    await storage.delete(boardFileKey(boardId, fileId));
  } catch (error) {
    console.error(`Board file delete failed for ${boardId}/${fileId}`, error);
    await release(false);
    return;
  }
  await db.delete(boardFile).where(mine);
};

const reclaim = async (deps: Reclaim, boardId: string, fileId: string) => {
  const { db, now = () => new Date() } = deps;
  const cutoff = new Date(now().getTime() - GRACE_MS);
  const claimedAt = now();
  // Compare-and-set: a concurrent register/presign touches the row first (claim misses) or finds
  // `deleting` (it reports failure and writes nothing).
  const [claimed] = await db
    .update(boardFile)
    .set({ state: "deleting", claimedAt })
    .where(
      and(
        eq(boardFile.boardId, boardId),
        eq(boardFile.fileId, fileId),
        eq(boardFile.state, "live"),
        lte(boardFile.orphanSince, cutoff),
        lte(boardFile.touchedAt, cutoff)
      )
    )
    .returning({ fileId: boardFile.fileId });
  if (claimed) {
    await finish(deps, boardId, fileId, claimedAt);
  }
};

/**
 * A claim past its lease may belong to a crashed sweep that already deleted the bytes, so it is never
 * simply handed back to `live`. It is taken over by compare-and-set on its `claimedAt` (a previous owner
 * that is still running then misses its own release/delete) and put through the same checks and the
 * same idempotent delete.
 */
const recoverStaleClaims = async (deps: Reclaim) => {
  const { db, now = () => new Date() } = deps;
  const stale = await db
    .select({
      boardId: boardFile.boardId,
      fileId: boardFile.fileId,
      claimedAt: boardFile.claimedAt,
    })
    .from(boardFile)
    .where(
      and(
        eq(boardFile.state, "deleting"),
        lt(boardFile.claimedAt, new Date(now().getTime() - CLAIM_LEASE_MS))
      )
    );
  await runBounded(stale, async (row) => {
    if (!row.claimedAt) {
      return;
    }
    try {
      const claimedAt = now();
      const [taken] = await db
        .update(boardFile)
        .set({ claimedAt })
        .where(
          and(
            eq(boardFile.boardId, row.boardId),
            eq(boardFile.fileId, row.fileId),
            eq(boardFile.state, "deleting"),
            eq(boardFile.claimedAt, row.claimedAt)
          )
        )
        .returning({ fileId: boardFile.fileId });
      if (taken) {
        await finish(deps, row.boardId, row.fileId, claimedAt);
      }
    } catch (error) {
      console.error(
        `Stale claim recovery failed for ${row.boardId}/${row.fileId}`,
        error
      );
    }
  });
};

const sweepBoard = async (deps: Deps, boardId: string) => {
  const { db, presence, now = () => new Date() } = deps;
  const snap = await snapshotOf(db, boardId);
  if (snap === "uncertain") {
    return;
  }
  const live = and(eq(boardFile.boardId, boardId), eq(boardFile.state, "live"));
  if (snap === "trashed") {
    // the grace restarts on restore: time spent in Trash does not count
    await db
      .update(boardFile)
      .set({ orphanSince: null })
      .where(and(live, isNotNull(boardFile.orphanSince)));
    return;
  }
  const rows = await db
    .select({ fileId: boardFile.fileId, orphanSince: boardFile.orphanSince })
    .from(boardFile)
    .where(live);
  const referenced = rows.filter((row) => snap.referenced.has(row.fileId));
  const orphans = rows.filter((row) => !snap.referenced.has(row.fileId));
  const cleared = referenced.filter((row) => row.orphanSince);
  if (cleared.length > 0) {
    await db
      .update(boardFile)
      .set({ orphanSince: null })
      .where(
        and(
          live,
          inArray(
            boardFile.fileId,
            cleared.map((row) => row.fileId)
          )
        )
      );
  }
  const fresh = orphans.filter((row) => !row.orphanSince);
  if (fresh.length > 0) {
    await db
      .update(boardFile)
      .set({ orphanSince: now() })
      .where(
        and(
          live,
          isNull(boardFile.orphanSince),
          inArray(
            boardFile.fileId,
            fresh.map((row) => row.fileId)
          )
        )
      );
  }
  const cutoff = new Date(now().getTime() - GRACE_MS);
  const due = orphans.filter(
    (row) => row.orphanSince && row.orphanSince <= cutoff
  );
  if (
    due.length === 0 ||
    now().getTime() - snap.idleSince.getTime() < GRACE_MS ||
    !(await isEmpty(presence, boardId))
  ) {
    return;
  }
  await runBounded(due, (row) => reclaim(deps, boardId, row.fileId));
};

/**
 * Reclaims board images nothing references. Safe to run on any replica and to re-run after a crash.
 * Known limit: a client that was offline for the whole grace and then references an already
 * deleted image has no re-upload path (the web client does not re-upload from its local cache).
 */
export const sweepBoardFiles = async (deps: Deps) => {
  const { db } = deps;
  await recoverStaleClaims(deps);
  const boards = await db
    .selectDistinct({ id: boardFile.boardId })
    .from(boardFile)
    .where(eq(boardFile.state, "live"));
  await runBounded(boards, async ({ id }) => {
    try {
      await sweepBoard(deps, id);
    } catch (error) {
      console.error(`Board file sweep failed for ${id}`, error);
    }
  });
};
