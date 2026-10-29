import type { BoardFileDto } from "../dtos/BoardFileDto";

export interface IBoardFileRepository {
  find(boardId: string, fileId: string): Promise<BoardFileDto | null>;
  save(boardId: string, file: BoardFileDto): Promise<void>;
}
