CREATE TABLE "meta_oauth_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"meta_user_id" text NOT NULL,
	"user_token_secret_id" uuid NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"candidates" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"key_id" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"ciphertext" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD COLUMN "external_user_id" text;--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD COLUMN "user_token_ref" text;--> statement-breakpoint
ALTER TABLE "meta_oauth_grants" ADD CONSTRAINT "meta_oauth_grants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_oauth_grants" ADD CONSTRAINT "meta_oauth_grants_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_oauth_grants" ADD CONSTRAINT "meta_oauth_grants_user_token_secret_id_secrets_id_fk" FOREIGN KEY ("user_token_secret_id") REFERENCES "public"."secrets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;