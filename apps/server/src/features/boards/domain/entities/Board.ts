import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Access, MemberRole, Role, Visibility } from "../values/Access";
import { BoardTitle } from "../values/BoardTitle";

/** What a caller proved about a board; the board decides what the proofs are worth. */
export interface AccessProofs {
  /** set when the caller is signed in; guests never get write access */
  userId: string | undefined;
  grantRole: MemberRole | null;
  /** role of a share link whose token matched and has not expired */
  shareRole: MemberRole | null;
  /** the caller holds a valid unlock proof for the current password */
  unlocked: boolean;
}

export interface Board {
  readonly id: string;
  readonly ownerId: string;
  readonly title: BoardTitle;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly visibility: Visibility;
  readonly passwordHash: string | null;
  /** null while live; the moment its owner moved it to Trash */
  readonly trashedAt: Date | null;
}

export const createBoard = (
  id: string,
  ownerId: string,
  title: BoardTitle,
  now: Date
): Board => ({
  id,
  ownerId,
  title,
  createdAt: now,
  updatedAt: now,
  visibility: "private",
  passwordHash: null,
  trashedAt: null,
});

export const restoreBoard = (row: {
  id: string;
  ownerId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  visibility: Visibility;
  passwordHash: string | null;
  trashedAt: Date | null;
}): Board => ({
  id: row.id,
  ownerId: row.ownerId,
  title: BoardTitle.restore(row.title),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  visibility: row.visibility,
  passwordHash: row.passwordHash,
  trashedAt: row.trashedAt,
});

export const renameBoard = (
  board: Board,
  title: BoardTitle,
  now: Date
): Board => ({ ...board, title, updatedAt: now });

export const protectBoard = (
  board: Board,
  visibility: Visibility,
  passwordHash: string | null,
  now: Date
): Result<Board, AppError> => {
  if (visibility === "password" && passwordHash === null) {
    return err(AppError.validation("Set a password before locking the board"));
  }
  return ok({ ...board, updatedAt: now, visibility, passwordHash });
};

export const isBoardOwnedBy = (
  board: Board,
  userId: string | undefined
): boolean => userId !== undefined && board.ownerId === userId;

// Order matters: the most specific grant wins, a public setting is the last resort.
const grantedRole = (board: Board, proofs: AccessProofs): Role | null => {
  if (isBoardOwnedBy(board, proofs.userId)) {
    return "owner";
  }
  if (proofs.grantRole) {
    return proofs.grantRole;
  }
  if (proofs.shareRole) {
    return proofs.shareRole;
  }
  if (
    board.visibility === "link" ||
    (board.visibility === "password" && proofs.unlocked)
  ) {
    return "viewer";
  }
  return null;
};

/** null when the proofs open nothing; guests get viewer at most. */
export const boardAccessFor = (
  board: Board,
  proofs: AccessProofs
): Access | null => {
  const role = grantedRole(board, proofs);
  if (!role) {
    return null;
  }
  const capped = proofs.userId === undefined ? "viewer" : role;
  return { role: capped, canRead: true, canWrite: capped !== "viewer" };
};
