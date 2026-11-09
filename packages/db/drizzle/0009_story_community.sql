CREATE TABLE "story_announcements" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"story_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_announcements_body_length" CHECK (char_length("story_announcements"."body") BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE TABLE "story_nominations" (
	"user_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_nominations_pkey" PRIMARY KEY("user_id","story_id","week_start")
);
--> statement-breakpoint
ALTER TABLE "comments" ALTER COLUMN "chapter_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "story_announcements" ADD CONSTRAINT "story_announcements_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_announcements" ADD CONSTRAINT "story_announcements_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_nominations" ADD CONSTRAINT "story_nominations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_nominations" ADD CONSTRAINT "story_nominations_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "story_announcements_story_idx" ON "story_announcements" USING btree ("story_id","created_at");--> statement-breakpoint
CREATE INDEX "story_announcements_author_idx" ON "story_announcements" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "story_nominations_week_story_idx" ON "story_nominations" USING btree ("week_start","story_id");--> statement-breakpoint
CREATE INDEX "story_nominations_story_id_idx" ON "story_nominations" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "comments_story_discussion_roots_idx" ON "comments" USING btree ("story_id","created_at","id") WHERE "comments"."chapter_id" IS NULL AND "comments"."parent_id" IS NULL;