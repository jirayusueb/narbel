import { defineRelationsPart } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

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
    visibility: text("visibility", { enum: ["private", "link", "password"] })
      .default("private")
      .notNull(),
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    // null while the board is live; set when its owner moved it to Trash
    trashedAt: timestamp("trashed_at"),
  },
  (table) => [
    index("board_ownerId_idx").on(table.ownerId),
    index("board_trashed_idx").on(table.ownerId, table.trashedAt),
    index("board_title_trgm_idx").using("gin", table.title.op("gin_trgm_ops")),
  ]
);

const memberRole = (name: string) =>
  text(name, { enum: ["editor", "viewer"] }).notNull();

// Invites are keyed by email; user_id is backfilled the first time that user resolves access.
export const boardAccess = pgTable(
  "board_access",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => board.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: memberRole("role"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("board_access_board_email_uq").on(table.boardId, table.email),
    unique("board_access_board_user_uq").on(table.boardId, table.userId),
    index("board_access_userId_idx").on(table.userId),
    index("board_access_email_idx").on(table.email),
  ]
);

export const boardShare = pgTable("board_share", {
  boardId: text("board_id")
    .primaryKey()
    .references(() => board.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  role: memberRole("role"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
});

export const comment = pgTable(
  "comment",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => board.id, { onDelete: "cascade" }),
    pageId: text("page_id").notNull(),
    x: doublePrecision("x").notNull(),
    y: doublePrecision("y").notNull(),
    body: text("body").notNull(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    editedAt: timestamp("edited_at"),
    resolvedAt: timestamp("resolved_at"),
    resolvedById: text("resolved_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    assigneeId: text("assignee_id").references(() => user.id, {
      onDelete: "set null",
    }),
    parentId: text("parent_id").references((): AnyPgColumn => comment.id, {
      onDelete: "cascade",
    }),
  },
  (table) => [
    index("comment_board_page_idx").on(table.boardId, table.pageId),
    index("comment_parent_idx").on(table.parentId, table.createdAt),
    index("comment_body_trgm_idx").using("gin", table.body.op("gin_trgm_ops")),
  ]
);

export const commentReaction = pgTable(
  "comment_reaction",
  {
    commentId: text("comment_id")
      .notNull()
      .references(() => comment.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.commentId, table.userId, table.emoji] }),
  ]
);

export const boardDocument = pgTable("board_document", {
  boardId: text("board_id")
    .primaryKey()
    .references(() => board.id, { onDelete: "cascade" }),
  state: bytea("state").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // false until board_text mirrors this state; the startup backfill picks these rows up
  textIndexed: boolean("text_indexed").default(false).notNull(),
});

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
