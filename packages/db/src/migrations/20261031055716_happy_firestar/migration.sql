CREATE TABLE "board_version" (
	"id" text PRIMARY KEY,
	"board_id" text NOT NULL,
	"kind" text NOT NULL,
	"state" bytea NOT NULL,
	"file_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_library" (
	"user_id" text PRIMARY KEY,
	"library_items" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "trashed_at" timestamp;--> statement-breakpoint
ALTER TABLE "board_file" ADD COLUMN "touched_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "board_file" ADD COLUMN "orphan_since" timestamp;--> statement-breakpoint
ALTER TABLE "board_file" ADD COLUMN "state" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "board_file" ADD COLUMN "claimed_at" timestamp;--> statement-breakpoint
CREATE INDEX "board_trashed_idx" ON "board" ("owner_id","trashed_at");--> statement-breakpoint
CREATE INDEX "board_file_gc_idx" ON "board_file" ("state","orphan_since");--> statement-breakpoint
CREATE INDEX "board_version_board_idx" ON "board_version" ("board_id","created_at");--> statement-breakpoint
ALTER TABLE "board_version" ADD CONSTRAINT "board_version_board_id_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "board"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "board_version" ADD CONSTRAINT "board_version_created_by_id_user_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "user_library" ADD CONSTRAINT "user_library_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;