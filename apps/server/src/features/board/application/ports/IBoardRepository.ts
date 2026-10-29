import type { Board } from "../../domain/entities/Board";
import type { MemberRole } from "../../domain/values/Access";

export interface IBoardRepository {
  findById(id: string): Promise<Board | null>;
  listByOwner(ownerId: string): Promise<Board[]>;
  /** Boards where the user (by id or invited email) holds an access row. */
  listSharedWith(
    userId: string,
    email: string
  ): Promise<{ board: Board; role: MemberRole }[]>;
  save(board: Board): Promise<void>;
  delete(id: string): Promise<void>;
}
