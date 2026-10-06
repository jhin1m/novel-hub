ALTER TABLE "ratings" ADD COLUMN "id" uuid DEFAULT uuidv7() NOT NULL;--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN "status" text DEFAULT 'visible' NOT NULL;--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "ratings_story_reviews_idx" ON "ratings" USING btree ("story_id","updated_at","id") WHERE "ratings"."status" = 'visible' AND "ratings"."review" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_id_key" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_review_length" CHECK ("ratings"."review" IS NULL OR char_length("ratings"."review") BETWEEN 1 AND 5000);