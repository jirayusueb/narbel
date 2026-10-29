CREATE TABLE "board_access" (
	"id" text PRIMARY KEY,
	"board_id" text NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "board_access_board_email_uq" UNIQUE("board_id","email"),
	CONSTRAINT "board_access_board_user_uq" UNIQUE("board_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "board_share" (
	"board_id" text PRIMARY KEY,
	"token" text NOT NULL UNIQUE,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" text PRIMARY KEY,
	"board_id" text NOT NULL,
	"page_id" text NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"body" text NOT NULL,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"parent_id" text
);
--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "password_hash" text;--> statement-breakpoint
CREATE INDEX "board_access_userId_idx" ON "board_access" ("user_id");--> statement-breakpoint
CREATE INDEX "board_access_email_idx" ON "board_access" ("email");--> statement-breakpoint
CREATE INDEX "comment_board_page_idx" ON "comment" ("board_id","page_id");--> statement-breakpoint
ALTER TABLE "board_access" ADD CONSTRAINT "board_access_board_id_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "board"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "board_access" ADD CONSTRAINT "board_access_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "board_share" ADD CONSTRAINT "board_share_board_id_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "board"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_board_id_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "board"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_id_user_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_parent_id_comment_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comment"("id") ON DELETE CASCADE;