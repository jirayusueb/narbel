import type { Board } from "../../domain/entities/Board";
import type { Role } from "../../domain/values/Access";
import type { SearchQuery } from "../../domain/values/SearchQuery";

export type MatchKind = "title" | "text" | "comment";

export interface RawMatch {
  kind: MatchKind;
  /** the full text that matched */
  text: string;
  pageId?: string;
  commentId?: string;
}

export interface BoardSearchHit {
  board: Board;
  role: Role;
  matches: RawMatch[];
}

export interface IBoardSearch {
  /** Boards the user owns or is a member of that match, title matches first, then newest; at most `limit`, each with at most `perBoard` matches. */
  search(
    user: { id: string; email: string },
    query: SearchQuery,
    limit: number,
    perBoard: number
  ): Promise<BoardSearchHit[]>;
}
