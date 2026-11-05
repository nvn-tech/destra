ALTER TABLE "publications" ADD COLUMN "container_id" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "child_container_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "final_caption" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "permalink" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;