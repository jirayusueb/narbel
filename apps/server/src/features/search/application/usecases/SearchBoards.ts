import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { SearchQuery } from "../../domain/values/SearchQuery";
import { toSearchBoardDto } from "../dtos/SearchDto";
import type { BoardSearchResultDto } from "../dtos/SearchDto";
import type { IReadableBoards } from "../ports/IReadableBoards";
import type { ISearchIndex, RawMatch } from "../ports/ISearchIndex";

const MAX_BOARDS = 20;
const MAX_MATCHES_PER_BOARD = 3;

/**
 * Boards the person can read whose title, element text or comments contain the query: title
 * matches first, then the newest; at most 20 boards, each with at most 3 matches (title, then
 * text, then comments).
 */
export class SearchBoards {
  constructor(
    private readonly boards: IReadableBoards,
    private readonly index: ISearchIndex
  ) {}

  async execute(input: {
    userId: string;
    email: string;
    q: string;
  }): Promise<Result<BoardSearchResultDto[], AppError>> {
    const query = SearchQuery.parse(input.q);
    if (!query) {
      return ok([]);
    }
    const readable = await this.boards.readableBoards({
      id: input.userId,
      email: input.email,
    });
    if (readable.length === 0) {
      return ok([]);
    }
    // the readable boards are the only source of ids, so text of a board the person cannot read never matches
    const found = await this.index.matches(
      readable.map((board) => board.id),
      query,
      MAX_MATCHES_PER_BOARD
    );
    const hits = readable.flatMap((board) => {
      const byTitle = query.matches(board.title);
      const matches: RawMatch[] = [
        ...(byTitle ? [{ kind: "title" as const, text: board.title }] : []),
        ...(found.get(board.id) ?? []),
      ];
      return matches.length > 0 ? [{ board, byTitle, matches }] : [];
    });
    return ok(
      hits
        .toSorted(
          (a, b) =>
            Number(b.byTitle) - Number(a.byTitle) ||
            b.board.updatedAt.getTime() - a.board.updatedAt.getTime() ||
            a.board.id.localeCompare(b.board.id)
        )
        .slice(0, MAX_BOARDS)
        .map(({ board, matches }) => ({
          board: toSearchBoardDto(board),
          matches: matches
            .slice(0, MAX_MATCHES_PER_BOARD)
            .map(({ text, ...match }) => ({
              ...match,
              snippet: query.snippet(text),
            })),
        }))
    );
  }
}
