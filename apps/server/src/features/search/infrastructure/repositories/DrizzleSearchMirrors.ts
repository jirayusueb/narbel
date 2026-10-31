import { and, eq, isNotNull, lt, or, sql } from "@narbel/db";
import type { DbExecutor } from "@narbel/db";
import {
  boardText,
  boardTextVersion,
  searchComment,
} from "@narbel/db/schema/search";

import type {
  ICommentIndex,
  IndexedComment,
  IndexedText,
  ITextIndex,
} from "../../application/ports/ISearchIndex";

const keyOf = (text: Pick<IndexedText, "pageId" | "elementId">) =>
  `${text.pageId}\u0000${text.elementId}`;

const rowOf = (comment: IndexedComment, at: Date) => ({
  commentId: comment.commentId,
  boardId: comment.boardId,
  pageId: comment.pageId,
  body: comment.body,
  changedAt: at,
});

/** Writes search's mirrors from drawing's and discussion's events; each write keeps the newest change. */
export class DrizzleSearchMirrors implements ITextIndex, ICommentIndex {
  constructor(private readonly db: DbExecutor) {}

  async replace(boardId: string, savedAt: Date, texts: IndexedText[]) {
    // the version row's lock orders concurrent sets of one board; an older set updates nothing and stops here
    const newer = await this.db
      .insert(boardTextVersion)
      .values({ boardId, savedAt })
      .onConflictDoUpdate({
        target: boardTextVersion.boardId,
        set: { savedAt },
        setWhere: lt(boardTextVersion.savedAt, savedAt),
      })
      .returning({ boardId: boardTextVersion.boardId });
    if (newer.length === 0) {
      return;
    }
    // diffed against the stored rows, so an unchanged set writes nothing
    const rows = await this.db
      .select({
        pageId: boardText.pageId,
        elementId: boardText.elementId,
        text: boardText.text,
      })
      .from(boardText)
      .where(eq(boardText.boardId, boardId));
    const stored = new Map(rows.map((row) => [keyOf(row), row]));
    const next = new Map(texts.map((text) => [keyOf(text), text]));
    const removed = rows.filter((row) => !next.has(keyOf(row)));
    const changed = [...next.values()].filter(
      (text) => stored.get(keyOf(text))?.text !== text.text
    );
    if (removed.length > 0) {
      await this.db
        .delete(boardText)
        .where(
          and(
            eq(boardText.boardId, boardId),
            or(
              ...removed.map((row) =>
                and(
                  eq(boardText.pageId, row.pageId),
                  eq(boardText.elementId, row.elementId)
                )
              )
            )
          )
        );
    }
    if (changed.length > 0) {
      await this.db
        .insert(boardText)
        .values(
          changed.map(({ pageId, elementId, text }) => ({
            boardId,
            pageId,
            elementId,
            text,
          }))
        )
        .onConflictDoUpdate({
          target: [boardText.boardId, boardText.pageId, boardText.elementId],
          set: { text: sql`excluded.text` },
        });
    }
  }

  async post(comment: IndexedComment, at: Date) {
    await this.db
      .insert(searchComment)
      .values(rowOf(comment, at))
      .onConflictDoNothing({ target: searchComment.commentId });
  }

  async edit(comment: IndexedComment, at: Date) {
    await this.db
      .insert(searchComment)
      .values(rowOf(comment, at))
      .onConflictDoUpdate({
        target: searchComment.commentId,
        set: { body: comment.body, changedAt: at },
        // a null body is a tombstone: nothing brings a deleted comment back
        setWhere: and(
          isNotNull(searchComment.body),
          lt(searchComment.changedAt, at)
        ),
      });
  }

  async remove(
    where: { boardId: string; pageId: string },
    commentIds: string[],
    at: Date
  ) {
    if (commentIds.length === 0) {
      return;
    }
    await this.db
      .insert(searchComment)
      .values(
        commentIds.map((commentId) => ({
          commentId,
          boardId: where.boardId,
          pageId: where.pageId,
          body: null,
          changedAt: at,
        }))
      )
      .onConflictDoUpdate({
        target: searchComment.commentId,
        set: { body: null, changedAt: at },
      });
  }
}
