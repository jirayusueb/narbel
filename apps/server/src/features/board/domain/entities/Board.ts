import { BoardTitle } from "../values/BoardTitle";

export class Board {
  private constructor(
    public readonly id: string,
    public readonly ownerId: string,
    public readonly title: BoardTitle,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  static create(
    id: string,
    ownerId: string,
    title: BoardTitle,
    now: Date
  ): Board {
    return new Board(id, ownerId, title, now, now);
  }

  static restore(
    id: string,
    ownerId: string,
    title: string,
    createdAt: Date,
    updatedAt: Date
  ): Board {
    return new Board(
      id,
      ownerId,
      BoardTitle.restore(title),
      createdAt,
      updatedAt
    );
  }

  rename(title: BoardTitle, now: Date): Board {
    return new Board(this.id, this.ownerId, title, this.createdAt, now);
  }

  isOwnedBy(userId: string): boolean {
    return this.ownerId === userId;
  }
}
