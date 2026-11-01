import type { Board } from "../../domain/entities/board";
import type { Role, Visibility } from "../../domain/values/access";

export interface BoardDto {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  visibility: Visibility;
  /** the caller's role on this board */
  role: Role;
  canWrite: boolean;
  /** true when the caller does not own the board */
  shared: boolean;
  /** set only while the board sits in Trash */
  trashedAt: string | null;
}

export const toBoardDto = (board: Board, role: Role): BoardDto => ({
  id: board.id,
  title: board.title.value,
  createdAt: board.createdAt.toISOString(),
  updatedAt: board.updatedAt.toISOString(),
  visibility: board.visibility,
  role,
  canWrite: role !== "viewer",
  shared: role !== "owner",
  trashedAt: board.trashedAt?.toISOString() ?? null,
});
