import { inArray, sql } from "@narbel/db";
import type { Database } from "@narbel/db";
import { board } from "@narbel/db/schema/boards";

import type {
  BoardSearchHit,
  IBoardSearch,
  MatchKind,
} from "../../application/ports/IBoardSearch";
import { Board } from "../../domain/entities/Board";
import type { Role } from "../../domain/values/Access";
import type { SearchQuery } from "../../domain/values/SearchQuery";

interface MatchRow extends Record<string, unknown> {
  board_id: string;
  role: Role;
  kind: MatchKind;
  page_id: string | null;
  comment_id: string | null;
  txt: string;
}

export class DrizzleBoardSearch implements IBoardSearch {
  constructor(private readonly db: Database) {}

  async search(
    user: { id: string; email: string },
    query: SearchQuery,
    limit: number,
    perBoard: number
  ): Promise<BoardSearchHit[]> {
    const pattern = query.likePattern();
    // readable is the only source of board ids, so text of a board the user cannot read never enters a row
    const { rows } = await this.db.execute<MatchRow>(sql`
      WITH readable AS (
        SELECT DISTINCT ON (b.id) b.id, b.title, b.updated_at,
          CASE WHEN b.owner_id = ${user.id} THEN 'owner' ELSE a.role END AS role
        FROM board b
        LEFT JOIN board_access a ON a.board_id = b.id
          AND (a.user_id = ${user.id} OR a.email = ${user.email.toLowerCase()})
        WHERE b.trashed_at IS NULL AND (b.owner_id = ${user.id} OR a.id IS NOT NULL)
        ORDER BY b.id
      ),
      hits AS (
        SELECT r.id AS board_id, 0 AS prio, 'title' AS kind,
          NULL::text AS page_id, NULL::text AS comment_id, r.title AS txt
        FROM readable r WHERE r.title ILIKE ${pattern}
        UNION ALL
        SELECT t.board_id, 1, 'text', t.page_id, NULL, t.text
        FROM board_text t JOIN readable r ON r.id = t.board_id
        WHERE t.text ILIKE ${pattern}
        UNION ALL
        SELECT c.board_id, 2, 'comment', c.page_id, c.id, c.body
        FROM comment c JOIN readable r ON r.id = c.board_id
        WHERE c.body ILIKE ${pattern}
      ),
      picked AS (
        SELECT r.id, r.role, r.updated_at, min(h.prio) = 0 AS by_title
        FROM hits h JOIN readable r ON r.id = h.board_id
        GROUP BY r.id, r.role, r.updated_at
        ORDER BY by_title DESC, r.updated_at DESC
        LIMIT ${limit}
      )
      SELECT p.id AS board_id, p.role, m.kind, m.page_id, m.comment_id, m.txt
      FROM picked p
      CROSS JOIN LATERAL (
        SELECT * FROM hits h WHERE h.board_id = p.id ORDER BY h.prio LIMIT ${perBoard}
      ) m
      ORDER BY p.by_title DESC, p.updated_at DESC, p.id, m.prio
    `);
    if (rows.length === 0) {
      return [];
    }
    const ids = [...new Set(rows.map((row) => row.board_id))];
    const found = await this.db
      .select()
      .from(board)
      .where(inArray(board.id, ids));
    const boards = new Map(found.map((row) => [row.id, Board.restore(row)]));
    const hits = new Map<string, BoardSearchHit>();
    for (const row of rows) {
      const owner = boards.get(row.board_id);
      if (owner) {
        const hit = hits.get(row.board_id) ?? {
          board: owner,
          role: row.role,
          matches: [],
        };
        hit.matches.push({
          kind: row.kind,
          text: row.txt,
          ...(row.page_id === null ? {} : { pageId: row.page_id }),
          ...(row.comment_id === null ? {} : { commentId: row.comment_id }),
        });
        hits.set(row.board_id, hit);
      }
    }
    return [...hits.values()];
  }
}
