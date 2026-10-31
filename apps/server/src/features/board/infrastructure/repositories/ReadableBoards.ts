import { sql } from "@narbel/db";
import type { Database } from "@narbel/db";

/** The boards a person can read now, with their current titles: the boards answer to notification's list. */
export const readableBoards = async (
  db: Database,
  person: { id: string; email: string }
): Promise<Map<string, string>> => {
  const { rows } = await db.execute<{ id: string; title: string }>(sql`
    SELECT DISTINCT ON (b.id) b.id, b.title
    FROM board b
    LEFT JOIN board_access a ON a.board_id = b.id
      AND (a.user_id = ${person.id} OR a.email = ${person.email.toLowerCase()})
    WHERE b.owner_id = ${person.id} OR a.id IS NOT NULL
  `);
  return new Map(rows.map((row) => [row.id, row.title]));
};
