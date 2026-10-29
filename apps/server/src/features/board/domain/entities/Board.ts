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
    public readonly passwordHash: string | null
  ) {}

  static create(
    id: string,
    ownerId: string,
    title: BoardTitle,
    now: Date
  ): Board {
    return new Board(id, ownerId, title, now, now, "private", null);
  }

  static restore(row: {
    id: string;
    ownerId: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    visibility: Visibility;
    passwordHash: string | null;
  }): Board {
    return new Board(
      row.id,
      row.ownerId,
      BoardTitle.restore(row.title),
      row.createdAt,
      row.updatedAt,
      row.visibility,
      row.passwordHash
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
      this.passwordHash
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
      passwordHash
    );
  }

  isOwnedBy(userId: string | undefined): boolean {
    return userId !== undefined && this.ownerId === userId;
  }
}
