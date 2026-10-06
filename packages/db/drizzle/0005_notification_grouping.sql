ALTER TABLE "notifications" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_unread_dedupe_key" ON "notifications" USING btree ("user_id","dedupe_key") WHERE "notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" IS NULL;