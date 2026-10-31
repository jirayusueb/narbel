import type { ReadableBoard } from "../ports/IReadableBoards";
import type { MatchKind } from "../ports/ISearchIndex";

/** The board of a result, in the shape the board list uses. */
export interface SearchBoardDto {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  visibility: ReadableBoard["visibility"];
  /** the caller's role on this board */
  role: ReadableBoard["role"];
  canWrite: boolean;
  /** true when the caller does not own the board */
  shared: boolean;
  /** always null: search never returns a board in Trash */
  trashedAt: null;
}

export interface SearchMatchDto {
  kind: MatchKind;
  snippet: string;
  pageId?: string;
  commentId?: string;
}

export interface BoardSearchResultDto {
  board: SearchBoardDto;
  matches: SearchMatchDto[];
}

export const toSearchBoardDto = (board: ReadableBoard): SearchBoardDto => ({
  id: board.id,
  title: board.title,
  createdAt: board.createdAt.toISOString(),
  updatedAt: board.updatedAt.toISOString(),
  visibility: board.visibility,
  role: board.role,
  canWrite: board.role !== "viewer",
  shared: board.role !== "owner",
  trashedAt: null,
});
