CREATE TABLE "data_deletion_requests" (
	"confirmation_code" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"external_user_hash" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"connections_removed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
