import { useQuery } from "@tanstack/react-query";

import { boardKeys } from "@/entities/board";
import type { Board } from "@/entities/board";
import { api, unwrap } from "@/shared/api";

export interface BoardSearchMatch {
  kind: "title" | "text" | "comment";
  snippet: string;
  pageId?: string;
  commentId?: string;
}

export interface BoardSearchResult {
  board: Board;
  matches: BoardSearchMatch[];
}

export const useSearchBoards = (q: string) =>
  useQuery({
    queryKey: boardKeys.search(q),
    queryFn: async (): Promise<BoardSearchResult[]> =>
      unwrap(await api.api.boards.search.get({ query: { q } })),
    staleTime: 10_000,
  });
