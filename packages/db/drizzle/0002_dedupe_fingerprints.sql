ALTER TABLE "chapter_fingerprints" ADD COLUMN "lsh_keys" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "chapter_fingerprints" ADD COLUMN "content_hash" text;--> statement-breakpoint
CREATE INDEX "chapter_fingerprints_lsh_keys_idx" ON "chapter_fingerprints" USING gin ("lsh_keys");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_open_auto_key" ON "reports" USING btree ("target_type","target_id","reason") WHERE "reports"."status" = 'open' AND "reports"."reporter_id" IS NULL;