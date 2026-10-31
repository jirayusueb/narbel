import { sql } from "@narbel/db";
import type { Database } from "@narbel/db";

import type {
  ISearchIndex,
  MatchKind,
  RawMatch,
} from "../../application/ports/ISearchIndex";
import type { SearchQuery } from "../../domain/values/SearchQuery";

interface MatchRow extends Record<string, unknown> {
  board_id: string;
  kind: Exclude<MatchKind, "title">;
  page_id: string;
  comment_id: string | null;
  txt: string;
}

/** Matches in search's own mirrors of drawing's text and discussion's comments. */
export class DrizzleSearchIndex implements ISearchIndex {
  constructor(private readonly db: Database) {}

  async matches(boardIds: string[], query: SearchQuery, perBoard: number) {
    const pattern = query.likePattern();
    const ids = sql`ARRAY[${sql.join(
      boardIds.map((id) => sql`${id}`),
      sql`, `
    )}]::text[]`;
    const { rows } = await this.db.execute<MatchRow>(sql`
      SELECT board_id, kind, page_id, comment_id, txt FROM (
        SELECT h.*, row_number() OVER (PARTITION BY h.board_id ORDER BY h.prio) AS n
        FROM (
          SELECT t.board_id, 1 AS prio, 'text' AS kind, t.page_id,
            NULL::text AS comment_id, t.text AS txt
          FROM board_text t
          WHERE t.board_id = ANY(${ids}) AND t.text ILIKE ${pattern}
          UNION ALL
          SELECT c.board_id, 2, 'comment', c.page_id, c.comment_id, c.body
          FROM search_comment c
          WHERE c.board_id = ANY(${ids}) AND c.body ILIKE ${pattern}
        ) h
      ) ranked
      WHERE n <= ${perBoard}
      ORDER BY board_id, n
    `);
    const found = new Map<string, RawMatch[]>();
    for (const row of rows) {
      found.set(row.board_id, [
        ...(found.get(row.board_id) ?? []),
        {
          kind: row.kind,
          text: row.txt,
          pageId: row.page_id,
          ...(row.comment_id === null ? {} : { commentId: row.comment_id }),
        },
      ]);
    }
    return found;
  }
}
