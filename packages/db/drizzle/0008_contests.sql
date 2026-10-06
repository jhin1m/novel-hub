CREATE TABLE "contest_entries" (
	"contest_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"placement" smallint,
	CONSTRAINT "contest_entries_pkey" PRIMARY KEY("contest_id","story_id"),
	CONSTRAINT "contest_entries_placement_range" CHECK ("contest_entries"."placement" IS NULL OR "contest_entries"."placement" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "contests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contests_slug_key" UNIQUE("slug"),
	CONSTRAINT "contests_time_range" CHECK ("contests"."ends_at" > "contests"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "contest_entries" ADD CONSTRAINT "contest_entries_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_entries" ADD CONSTRAINT "contest_entries_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contests" ADD CONSTRAINT "contests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contest_entries_placement_key" ON "contest_entries" USING btree ("contest_id","placement") WHERE "contest_entries"."placement" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "contest_entries_contest_created_idx" ON "contest_entries" USING btree ("contest_id","created_at");--> statement-breakpoint
CREATE INDEX "contest_entries_story_id_idx" ON "contest_entries" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "contests_ends_at_idx" ON "contests" USING btree ("ends_at");