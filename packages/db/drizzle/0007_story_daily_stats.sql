CREATE TABLE "story_daily_stats" (
	"story_id" uuid NOT NULL,
	"date" date NOT NULL,
	"unique_readers" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "story_daily_stats_pkey" PRIMARY KEY("story_id","date")
);
--> statement-breakpoint
ALTER TABLE "story_daily_stats" ADD CONSTRAINT "story_daily_stats_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "story_daily_stats_date_idx" ON "story_daily_stats" USING btree ("date");