import { index, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { board } from "./boards";

// Search mirror of the text elements inside board_document.state, one row per element.
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
