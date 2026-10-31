import type { Board } from "../../domain/entities/Board";
import type { MemberRole } from "../../domain/values/Access";

export interface IBoardRepository {
  /** A live board; null for a missing one and for one in Trash. */
  findById(id: string): Promise<Board | null>;
  /** Also returns boards in Trash; only the access guard and the owner-only Trash actions may use it. */
  findIncludingTrashed(id: string): Promise<Board | null>;
  /** The owner's live boards. */
  listByOwner(ownerId: string): Promise<Board[]>;
  /** The owner's boards in Trash, newest first. */
  listTrashedByOwner(ownerId: string): Promise<Board[]>;
  /** Boards where the user (by id or invited email) holds an access row. */
  listSharedWith(
    userId: string,
    email: string
  ): Promise<{ board: Board; role: MemberRole }[]>;
  save(board: Board): Promise<void>;
  /** Moves the board's last-edit time (a drawing save); resolves to its owner, undefined when it is gone. */
  markEdited(id: string, at: Date): Promise<string | undefined>;
  /** Removes the board for good, only while it is in Trash; false when it is live or already gone. */
  deleteTrashed(id: string): Promise<boolean>;
  /** Moves the board in or out of Trash; false when it was already in that state (or is gone). */
  setTrashed(id: string, at: Date | null): Promise<boolean>;
}
