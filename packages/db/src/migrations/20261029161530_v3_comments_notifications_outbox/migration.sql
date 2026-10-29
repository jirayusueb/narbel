CREATE TABLE "comment_reaction" (
	"comment_id" text,
	"user_id" text,
	"emoji" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "comment_reaction_pkey" PRIMARY KEY("comment_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"dedupe_key" text UNIQUE
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"user_id" text PRIMARY KEY,
	"username" text UNIQUE,
	"avatar_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "edited_at" timestamp;--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "resolved_by_id" text;--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "assignee_id" text;--> statement-breakpoint
ALTER TABLE "comment" DROP COLUMN "author_name";--> statement-breakpoint
CREATE INDEX "comment_parent_idx" ON "comment" ("parent_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_user_created_idx" ON "notification" ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "outbox_due_idx" ON "outbox" ("status","next_attempt_at");--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_resolved_by_id_user_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_assignee_id_user_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "comment_reaction" ADD CONSTRAINT "comment_reaction_comment_id_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comment"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "comment_reaction" ADD CONSTRAINT "comment_reaction_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;