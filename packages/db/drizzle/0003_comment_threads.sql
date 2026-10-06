DROP INDEX "comments_chapter_id_created_at_idx";--> statement-breakpoint
DROP INDEX "comments_parent_id_idx";--> statement-breakpoint
CREATE INDEX "comments_chapter_roots_idx" ON "comments" USING btree ("chapter_id","created_at","id") WHERE "comments"."parent_id" IS NULL;--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_id","created_at","id");--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_body_length" CHECK (char_length("comments"."body") BETWEEN 1 AND 2000);