import type { Board } from "../../domain/entities/Board";

export interface BoardDto {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export const toBoardDto = (board: Board): BoardDto => ({
  id: board.id,
  title: board.title.value,
  createdAt: board.createdAt.toISOString(),
  updatedAt: board.updatedAt.toISOString(),
});
