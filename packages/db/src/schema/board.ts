import { defineRelationsPart } from "drizzle-orm";
import {
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});

export const board = pgTable(
  "board",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("board_ownerId_idx").on(table.ownerId)]
);

export const boardDocument = pgTable("board_document", {
  boardId: text("board_id")
    .primaryKey()
    .references(() => board.id, { onDelete: "cascade" }),
  state: bytea("state").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const boardFile = pgTable(
  "board_file",
  {
    boardId: text("board_id")
      .notNull()
      .references(() => board.id, { onDelete: "cascade" }),
    fileId: text("file_id").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.boardId, table.fileId] })]
);

export const boardRelations = defineRelationsPart(
  { user, board, boardDocument, boardFile },
  (r) => ({
    board: {
      owner: r.one.user({ from: r.board.ownerId, to: r.user.id }),
      document: r.one.boardDocument({
        from: r.board.id,
        to: r.boardDocument.boardId,
      }),
      files: r.many.boardFile({ from: r.board.id, to: r.boardFile.boardId }),
    },
    boardDocument: {
      board: r.one.board({ from: r.boardDocument.boardId, to: r.board.id }),
    },
    boardFile: {
      board: r.one.board({ from: r.boardFile.boardId, to: r.board.id }),
    },
  })
);
