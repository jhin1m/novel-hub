CREATE TABLE "content_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "content_events_pending_idx" ON "content_events" USING btree ("id") WHERE processed_at is null;