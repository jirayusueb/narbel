CREATE TABLE "board_text_version" (
	"board_id" text PRIMARY KEY,
	"saved_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_comment" (
	"comment_id" text PRIMARY KEY,
	"board_id" text NOT NULL,
	"page_id" text NOT NULL,
	"body" text,
	"changed_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "search_comment_board_idx" ON "search_comment" ("board_id");--> statement-breakpoint
CREATE INDEX "search_comment_body_trgm_idx" ON "search_comment" USING gin ("body" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "board_text_version" ADD CONSTRAINT "board_text_version_board_id_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "board"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "search_comment" ADD CONSTRAINT "search_comment_board_id_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "board"("id") ON DELETE CASCADE;--> statement-breakpoint
-- One-time backfill of the comments that exist before discussion publishes comment events. It lives
-- here, not in features/search, because migrations sit outside the context rules: only this script
-- reads discussion's table on search's behalf. Later events win over these rows by changed_at.
INSERT INTO "search_comment" ("comment_id", "board_id", "page_id", "body", "changed_at")
SELECT "id", "board_id", "page_id", "body", coalesce("edited_at", "created_at") FROM "comment";