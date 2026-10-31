import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, lt } from "@narbel/db";
import type { DbExecutor } from "@narbel/db";
import { boardVersion } from "@narbel/db/schema/board";

import type {
  NewVersion,
  VersionKind,
} from "../../application/ports/IBoardVersions";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** An automatic checkpoint is taken by the first save at least this long after the previous one. */
export const CHECKPOINT_EVERY_MS = 10 * MINUTE;
/** Versions older than this are dropped; so are the oldest beyond the per-kind cap. */
export const RETENTION_MS = 30 * DAY;
export const RETENTION_COUNT: Record<VersionKind, number> = {
  auto: 300,
  pre_restore: 50,
};

const prune = async (
  db: DbExecutor,
  boardId: string,
  kind: VersionKind,
  now: Date
) => {
  const own = and(
    eq(boardVersion.boardId, boardId),
    eq(boardVersion.kind, kind)
  );
  const surplus = await db
    .select({ id: boardVersion.id })
    .from(boardVersion)
    .where(own)
    .orderBy(desc(boardVersion.createdAt))
    .offset(RETENTION_COUNT[kind]);
  if (surplus.length > 0) {
    await db.delete(boardVersion).where(
      inArray(
        boardVersion.id,
        surplus.map((row) => row.id)
      )
    );
  }
  await db
    .delete(boardVersion)
    .where(
      and(
        own,
        lt(boardVersion.createdAt, new Date(now.getTime() - RETENTION_MS))
      )
    );
};

export const insertVersion = async (
  db: DbExecutor,
  boardId: string,
  version: NewVersion,
  now = new Date()
) => {
  await db.insert(boardVersion).values({
    id: randomUUID(),
    boardId,
    kind: version.kind,
    state: version.state,
    fileIds: version.fileIds,
    createdById: version.createdById ?? null,
    createdAt: now,
  });
  await prune(db, boardId, version.kind, now);
};

/** Inserts an automatic checkpoint unless one was taken recently. Runs inside the document save's transaction. */
export const checkpointIfDue = async (
  db: DbExecutor,
  boardId: string,
  state: Uint8Array,
  fileIds: string[],
  now: Date
) => {
  const [latest] = await db
    .select({ createdAt: boardVersion.createdAt })
    .from(boardVersion)
    .where(
      and(eq(boardVersion.boardId, boardId), eq(boardVersion.kind, "auto"))
    )
    .orderBy(desc(boardVersion.createdAt))
    .limit(1);
  const due =
    !latest ||
    now.getTime() - latest.createdAt.getTime() >= CHECKPOINT_EVERY_MS;
  if (due) {
    await insertVersion(db, boardId, { kind: "auto", state, fileIds }, now);
  }
};
