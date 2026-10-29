import type { Board } from "../../domain/entities/Board";

export interface IBoardRepository {
  findById(id: string): Promise<Board | null>;
  listByOwner(ownerId: string): Promise<Board[]>;
  save(board: Board): Promise<void>;
  delete(id: string): Promise<void>;
}
