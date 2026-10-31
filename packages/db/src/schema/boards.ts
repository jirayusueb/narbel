import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { user } from "./auth";

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
