import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { board } from "./boards";
import { comment } from "./discussion";

// Search mirror of the text elements inside board_document.state, one row per element, kept by drawing's text events.
export const boardText = pgTable(
  "board_text",
  {
    boardId: text("board_id")
      .notNull()
      .references(() => board.id, { onDelete: "cascade" }),
    pageId: text("page_id").notNull(),
    elementId: text("element_id").notNull(),
    text: text("text").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.boardId, table.pageId, table.elementId] }),
    index("board_text_trgm_idx").using("gin", table.text.op("gin_trgm_ops")),
  ]
);

// The drawing save board_text reflects: an older text event that arrives late is ignored.
export const boardTextVersion = pgTable("board_text_version", {
  boardId: text("board_id")
    .primaryKey()
    .references(() => board.id, { onDelete: "cascade" }),
  savedAt: timestamp("saved_at").notNull(),
});

// Search mirror of discussion's comments, kept by its comment events. The comment foreign key is
// the migration-time safety net: a comment deleted by any cascade (its thread, its author's
// account, its board) takes its mirror row in the same transaction.
export const searchComment = pgTable(
  "search_comment",
  {
    commentId: text("comment_id")
      .primaryKey()
      .references(() => comment.id, { onDelete: "cascade" }),
    boardId: text("board_id")
      .notNull()
      .references(() => board.id, { onDelete: "cascade" }),
    pageId: text("page_id").notNull(),
    // null once deleted: the tombstone keeps a late post or edit from bringing the comment back
    body: text("body"),
    // when the change this row reflects happened; an older edit that arrives late is ignored
    changedAt: timestamp("changed_at").notNull(),
  },
  (table) => [
    index("search_comment_board_idx").on(table.boardId),
    index("search_comment_body_trgm_idx").using(
      "gin",
      table.body.op("gin_trgm_ops")
    ),
  ]
);
