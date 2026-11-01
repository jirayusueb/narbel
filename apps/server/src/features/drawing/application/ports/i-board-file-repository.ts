import type { BoardId } from "../../../../shared/kernel/types/ids";
import type { BoardFileDto } from "../dtos/board-file-dto";

export interface IBoardFileRepository {
  /** null for an unknown file and for one the cleanup job is deleting. */
  findById(boardId: BoardId, fileId: string): Promise<BoardFileDto | null>;
  /** Registers or touches the file. False when cleanup is deleting it: nothing was written, retry later. */
  save(boardId: BoardId, file: BoardFileDto): Promise<boolean>;
}
