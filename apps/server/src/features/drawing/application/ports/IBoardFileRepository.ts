import type { BoardFileDto } from "../dtos/BoardFileDto";

export interface IBoardFileRepository {
  /** null for an unknown file and for one the cleanup job is deleting. */
  findById(boardId: string, fileId: string): Promise<BoardFileDto | null>;
  /** Registers or touches the file. False when cleanup is deleting it: nothing was written, retry later. */
  save(boardId: string, file: BoardFileDto): Promise<boolean>;
}
