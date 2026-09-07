ALTER TABLE "artifacts" ALTER COLUMN "storage_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "content" jsonb;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "active_app_version" integer;