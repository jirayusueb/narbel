import type { Visibility } from "../values/Access";
import { BoardTitle } from "../values/BoardTitle";

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

  withProtection(
    visibility: Visibility,
    passwordHash: string | null,
    now: Date
  ): Board {
    return new Board(
      this.id,
      this.ownerId,
      this.title,
      this.createdAt,
      now,
      visibility,
      passwordHash,
      this.trashedAt
    );
  }

  isOwnedBy(userId: string | undefined): boolean {
    return userId !== undefined && this.ownerId === userId;
  }
}
