import type { MatchKind } from "../ports/IBoardSearch";
import type { BoardDto } from "./BoardDto";

export interface SearchMatchDto {
  kind: MatchKind;
  snippet: string;
  pageId?: string;
  commentId?: string;
}

export interface BoardSearchResultDto {
  board: BoardDto;
  matches: SearchMatchDto[];
}
