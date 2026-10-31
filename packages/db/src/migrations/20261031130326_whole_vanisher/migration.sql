-- Tombstones and rows whose comment is already gone would violate the new key; the key now does their job.
DELETE FROM "search_comment" WHERE "comment_id" NOT IN (SELECT "id" FROM "comment");--> statement-breakpoint
ALTER TABLE "search_comment" ADD CONSTRAINT "search_comment_comment_id_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comment"("id") ON DELETE CASCADE;
