import { defineRelationsPart } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { board } from "./boards";

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});

export const boardDocument = pgTable("board_document", {
  boardId: text("board_id")
    .primaryKey()
    .references(() => board.id, { onDelete: "cascade" }),
  state: bytea("state").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // false until a text event with this state's full text set was published; the startup backfill picks these rows up
  textIndexed: boolean("text_indexed").default(false).notNull(),
});

// Full Yjs state of a board at one moment. `auto` checkpoints are taken in the transaction of a
// board_document save; `pre_restore` is the recovery point before a restore.
// file_ids lists every image fileId the state references, so file cleanup can keep what history needs.
export const boardVersion = pgTable(
  "board_version",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => board.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["auto", "pre_restore"] }).notNull(),
    state: bytea("state").notNull(),
    fileIds: text("file_ids").array().notNull().default([]),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("board_version_board_idx").on(table.boardId, table.createdAt),
  ]
);

// One Excalidraw library per account; items are stored exactly as the editor hands them over.
export const userLibrary = pgTable("user_library", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  libraryItems: jsonb("library_items").$type<unknown[]>().notNull(),
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
    // last presign/upload/register; GC never claims a file touched within its grace
    touchedAt: timestamp("touched_at").defaultNow().notNull(),
    // set while no live element or retained version references the file; cleared when one does
    orphanSince: timestamp("orphan_since"),
    // `deleting` is a GC claim: its S3 object is about to go, so no write path may revive the row
    state: text("state", { enum: ["live", "deleting"] })
      .default("live")
      .notNull(),
    claimedAt: timestamp("claimed_at"),
  },
  (table) => [
    primaryKey({ columns: [table.boardId, table.fileId] }),
    index("board_file_gc_idx").on(table.state, table.orphanSince),
  ]
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
