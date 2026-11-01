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

export class Board {
  private constructor(
    public readonly id: string,
    public readonly ownerId: string,
    public readonly title: BoardTitle,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly visibility: Visibility,
    public readonly passwordHash: string | null,
    /** null while live; the moment its owner moved it to Trash */
    public readonly trashedAt: Date | null
  ) {}

  static create(
    id: string,
    ownerId: string,
    title: BoardTitle,
    now: Date
  ): Board {
    return new Board(id, ownerId, title, now, now, "private", null, null);
  }

  static restore(row: {
    id: string;
    ownerId: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    visibility: Visibility;
    passwordHash: string | null;
    trashedAt: Date | null;
  }): Board {
    return new Board(
      row.id,
      row.ownerId,
      BoardTitle.restore(row.title),
      row.createdAt,
      row.updatedAt,
      row.visibility,
      row.passwordHash,
      row.trashedAt
    );
  }

  rename(title: BoardTitle, now: Date): Board {
    return new Board(
      this.id,
      this.ownerId,
      title,
      this.createdAt,
      now,
      this.visibility,
      this.passwordHash,
      this.trashedAt
    );
  }

  protect(
    visibility: Visibility,
    passwordHash: string | null,
    now: Date
  ): Result<Board, AppError> {
    if (visibility === "password" && passwordHash === null) {
      return err(
        AppError.validation("Set a password before locking the board")
      );
    }
    return ok(
      new Board(
        this.id,
        this.ownerId,
        this.title,
        this.createdAt,
        now,
        visibility,
        passwordHash,
        this.trashedAt
      )
    );
  }

  isOwnedBy(userId: string | undefined): boolean {
    return userId !== undefined && this.ownerId === userId;
  }

  /** null when the proofs open nothing; guests get viewer at most. */
  accessFor(proofs: AccessProofs): Access | null {
    const role = this.grantedRole(proofs);
    if (!role) {
      return null;
    }
    const capped = proofs.userId === undefined ? "viewer" : role;
    return { role: capped, canRead: true, canWrite: capped !== "viewer" };
  }

  // Order matters: the most specific grant wins, a public setting is the last resort.
  private grantedRole(proofs: AccessProofs): Role | null {
    if (this.isOwnedBy(proofs.userId)) {
      return "owner";
    }
    if (proofs.grantRole) {
      return proofs.grantRole;
    }
    if (proofs.shareRole) {
      return proofs.shareRole;
    }
    if (
      this.visibility === "link" ||
      (this.visibility === "password" && proofs.unlocked)
    ) {
      return "viewer";
    }
    return null;
  }
}
