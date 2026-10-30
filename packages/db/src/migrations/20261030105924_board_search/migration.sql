CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "board_text" (
	"board_id" text,
	"page_id" text,
	"element_id" text,
	"text" text NOT NULL,
	CONSTRAINT "board_text_pkey" PRIMARY KEY("board_id","page_id","element_id")
);
--> statement-breakpoint
ALTER TABLE "board_document" ADD COLUMN "text_indexed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "board_title_trgm_idx" ON "board" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "board_text_trgm_idx" ON "board_text" USING gin ("text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "comment_body_trgm_idx" ON "comment" USING gin ("body" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "board_text" ADD CONSTRAINT "board_text_board_id_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "board"("id") ON DELETE CASCADE;