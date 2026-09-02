ALTER TABLE "sessions" ADD COLUMN "chat" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "cards" jsonb DEFAULT '[]'::jsonb NOT NULL;