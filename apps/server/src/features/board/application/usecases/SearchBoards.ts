import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { SearchQuery } from "../../domain/values/SearchQuery";
import { toBoardDto } from "../dtos/BoardDto";
import type { BoardSearchResultDto } from "../dtos/SearchDto";
import type { IBoardSearch } from "../ports/IBoardSearch";

const MAX_BOARDS = 20;
const MAX_MATCHES_PER_BOARD = 3;

export class SearchBoards {
  constructor(private readonly search: IBoardSearch) {}

  async execute(input: {
    userId: string;
    email: string;
    q: string;
  }): Promise<Result<BoardSearchResultDto[], AppError>> {
    const query = SearchQuery.parse(input.q);
    if (!query) {
      return ok([]);
    }
    const hits = await this.search.search(
      { id: input.userId, email: input.email },
      query,
      MAX_BOARDS,
      MAX_MATCHES_PER_BOARD
    );
    return ok(
      hits.map(({ board, role, matches }) => ({
        board: toBoardDto(board, role),
        matches: matches.map(({ text, ...match }) => ({
          ...match,
          snippet: query.snippet(text),
        })),
      }))
    );
  }
}
