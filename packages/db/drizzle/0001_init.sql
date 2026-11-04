CREATE TYPE "public"."account_relation_kind" AS ENUM('mention', 'collab', 'tagged', 'co_hashtag');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('business', 'creator', 'personal', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."approval_decision" AS ENUM('approved', 'rejected', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."autonomy_level" AS ENUM('manual', 'assisted', 'autopilot');--> statement-breakpoint
CREATE TYPE "public"."check_result" AS ENUM('pass', 'warn', 'block');--> statement-breakpoint
CREATE TYPE "public"."compliance_decision" AS ENUM('pass', 'review', 'block');--> statement-breakpoint
CREATE TYPE "public"."compliance_rule_kind" AS ENUM('lexicon', 'regex', 'llm_judge', 'lexicon_llm', 'required_field');--> statement-breakpoint
CREATE TYPE "public"."compliance_severity" AS ENUM('warn', 'block', 'hard_block', 'require_field');--> statement-breakpoint
CREATE TYPE "public"."compliance_trigger" AS ENUM('generated', 'edited', 'rule_update', 'manual');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('active', 'expired', 'revoked', 'error');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('idea', 'drafting', 'in_review', 'approved', 'scheduled', 'published', 'measured', 'rejected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."crawl_job_kind" AS ENUM('profile', 'recent_posts', 'metrics_refresh');--> statement-breakpoint
CREATE TYPE "public"."crawl_tier" AS ENUM('hot', 'warm', 'cold');--> statement-breakpoint
CREATE TYPE "public"."embedding_kind" AS ENUM('caption', 'transcript', 'visual', 'combined');--> statement-breakpoint
CREATE TYPE "public"."feed_item_status" AS ENUM('shown', 'saved', 'dismissed', 'used');--> statement-breakpoint
CREATE TYPE "public"."ingestion_source" AS ENUM('official_api', 'vendor', 'manual');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'editor', 'approver', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('instagram', 'facebook', 'threads', 'x', 'linkedin', 'tiktok', 'youtube');--> statement-breakpoint
CREATE TYPE "public"."post_format" AS ENUM('image', 'carousel', 'reel', 'video', 'short', 'story', 'text', 'thread', 'document');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('scheduled', 'publishing', 'published', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."reference_reason" AS ENUM('user', 'seed_pack', 'discovery_accept');--> statement-breakpoint
CREATE TYPE "public"."source_account_status" AS ENUM('active', 'private', 'gone', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."usage_kind" AS ENUM('llm_analysis', 'llm_generation', 'llm_compliance', 'embedding', 'transcription', 'vendor_fetch', 'platform_api');--> statement-breakpoint
CREATE TYPE "public"."variant_compliance_status" AS ENUM('pending', 'pass', 'warn', 'block');--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_relations" (
	"from_account_id" uuid NOT NULL,
	"to_account_id" uuid NOT NULL,
	"kind" "account_relation_kind" NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "account_relations_from_account_id_to_account_id_kind_pk" PRIMARY KEY("from_account_id","to_account_id","kind")
);
--> statement-breakpoint
CREATE TABLE "account_snapshots" (
	"account_id" uuid NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"followers" bigint,
	"following" bigint,
	"media_count" integer,
	CONSTRAINT "account_snapshots_account_id_captured_at_pk" PRIMARY KEY("account_id","captured_at")
);
--> statement-breakpoint
CREATE TABLE "account_style_profiles" (
	"account_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	"sample_size" integer NOT NULL,
	"window_days" integer NOT NULL,
	"profile" jsonb NOT NULL,
	CONSTRAINT "account_style_profiles_account_id_version_pk" PRIMARY KEY("account_id","version")
);
--> statement-breakpoint
CREATE TABLE "post_embeddings" (
	"post_id" uuid NOT NULL,
	"kind" "embedding_kind" NOT NULL,
	"model" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	CONSTRAINT "post_embeddings_post_id_kind_model_pk" PRIMARY KEY("post_id","kind","model")
);
--> statement-breakpoint
CREATE TABLE "post_features" (
	"post_id" uuid NOT NULL,
	"extractor_version" text NOT NULL,
	"structural" jsonb,
	"voice" jsonb,
	"visual" jsonb,
	"transcript" text,
	"ocr_text" text,
	"comment_summary" jsonb,
	"compliance_flags" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_features_post_id_extractor_version_pk" PRIMARY KEY("post_id","extractor_version")
);
--> statement-breakpoint
CREATE TABLE "post_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" "media_type" NOT NULL,
	"storage_key" text,
	"width" integer,
	"height" integer,
	"duration_s" real,
	"expires_at" timestamp with time zone,
	CONSTRAINT "post_media_post_position_uq" UNIQUE("post_id","position")
);
--> statement-breakpoint
CREATE TABLE "post_metric_snapshots" (
	"post_id" uuid NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"age_hours" real,
	"likes" bigint,
	"comments" bigint,
	"views" bigint,
	"shares" bigint,
	"saves" bigint,
	CONSTRAINT "post_metric_snapshots_post_id_captured_at_pk" PRIMARY KEY("post_id","captured_at")
);
--> statement-breakpoint
CREATE TABLE "post_performance" (
	"post_id" uuid PRIMARY KEY NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	"engagement_rate" real,
	"er_vs_account_z" real,
	"percentile_in_account" real,
	"percentile_in_vertical" real
);
--> statement-breakpoint
CREATE TABLE "post_topics" (
	"post_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"confidence" real NOT NULL,
	CONSTRAINT "post_topics_post_id_topic_id_pk" PRIMARY KEY("post_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"platform_post_id" text NOT NULL,
	"format" "post_format" NOT NULL,
	"caption" text,
	"language" text,
	"published_at" timestamp with time zone,
	"permalink" text,
	"hashtags" text[] DEFAULT '{}' NOT NULL,
	"mentions" text[] DEFAULT '{}' NOT NULL,
	"duration_s" real,
	"media_count" integer,
	"content_hash" text,
	"ingested_via" "ingestion_source" NOT NULL,
	"is_owned_by_tenant" boolean DEFAULT false NOT NULL,
	"raw" jsonb,
	"raw_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_platform_post_uq" UNIQUE("platform","platform_post_id")
);
--> statement-breakpoint
CREATE TABLE "source_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" "platform" NOT NULL,
	"platform_account_id" text NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"account_type" "account_type" DEFAULT 'unknown' NOT NULL,
	"vertical_ids" uuid[] DEFAULT '{}' NOT NULL,
	"crawl_tier" "crawl_tier" DEFAULT 'cold' NOT NULL,
	"reference_count" integer DEFAULT 0 NOT NULL,
	"last_crawled_at" timestamp with time zone,
	"status" "source_account_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_accounts_platform_account_uq" UNIQUE("platform","platform_account_id")
);
--> statement-breakpoint
CREATE TABLE "crawl_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_account_id" uuid NOT NULL,
	"kind" "crawl_job_kind" NOT NULL,
	"adapter" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_fetch_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adapter" text NOT NULL,
	"source_account_id" uuid,
	"items_fetched" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "compliance_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vertical_id" uuid NOT NULL,
	"code" text NOT NULL,
	"version" integer NOT NULL,
	"severity" "compliance_severity" NOT NULL,
	"kind" "compliance_rule_kind" NOT NULL,
	"definition" jsonb NOT NULL,
	"source_reference" text,
	"prevention_hint" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_rules_vertical_code_version_uq" UNIQUE("vertical_id","code","version")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vertical_id" uuid NOT NULL,
	"parent_id" uuid,
	"slug" text NOT NULL,
	"label_pt" text NOT NULL,
	"embedding" vector(1024),
	CONSTRAINT "topics_vertical_slug_uq" UNIQUE("vertical_id","slug")
);
--> statement-breakpoint
CREATE TABLE "vertical_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vertical_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "vertical_versions_vertical_version_uq" UNIQUE("vertical_id","version")
);
--> statement-breakpoint
CREATE TABLE "verticals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"country" char(2) NOT NULL,
	"language" text NOT NULL,
	"regulator" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verticals_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"comment" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" uuid,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prev_hash" text,
	"hash" text
);
--> statement-breakpoint
CREATE TABLE "billing_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"tax_id" text,
	"owner_user_id" text NOT NULL,
	"plan" text DEFAULT 'design_partner' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"voice_notes" text,
	"banned_terms" text[] DEFAULT '{}' NOT NULL,
	"emoji_policy" text,
	"hashtag_policy" text,
	"cta_preferences" jsonb,
	"visual_kit" jsonb,
	"ai_disclosure" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"rule_version" integer NOT NULL,
	"result" "check_result" NOT NULL,
	"confidence" real,
	"evidence" jsonb,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"check_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"level" text NOT NULL,
	"justification" text NOT NULL,
	"attested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"trigger" "compliance_trigger" NOT NULL,
	"ruleset_version" text NOT NULL,
	"decision" "compliance_decision" NOT NULL,
	"cost_usd" numeric(12, 6),
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connected_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"source_account_id" uuid,
	"platform_account_id" text NOT NULL,
	"linked_page_id" text,
	"token_ref" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"token_expires_at" timestamp with time zone,
	"status" "connection_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connected_accounts_workspace_platform_uq" UNIQUE("workspace_id","platform","platform_account_id")
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"media_ref" text NOT NULL,
	"patient_ref_hash" text NOT NULL,
	"scope" text NOT NULL,
	"signed_doc_key" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"topic_id" uuid,
	"title" text,
	"status" "content_status" DEFAULT 'idea' NOT NULL,
	"strategy_tags" text[] DEFAULT '{}' NOT NULL,
	"inspiration_post_ids" uuid[] DEFAULT '{}' NOT NULL,
	"pre_approved" boolean DEFAULT false NOT NULL,
	"suggested_slot" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"format" "post_format" NOT NULL,
	"body" jsonb NOT NULL,
	"generation_run_id" uuid,
	"originality_score" real,
	"compliance_status" "variant_compliance_status" DEFAULT 'pending' NOT NULL,
	"is_selected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_feed_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"score" real NOT NULL,
	"reasons" jsonb,
	"status" "feed_item_status" DEFAULT 'shown' NOT NULL,
	"shown_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acted_at" timestamp with time zone,
	CONSTRAINT "discovery_feed_items_workspace_post_uq" UNIQUE("workspace_id","post_id")
);
--> statement-breakpoint
CREATE TABLE "generation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"style_target_version" integer,
	"input_refs" jsonb,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_usd" numeric(12, 6),
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interest_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"raw_tag" text NOT NULL,
	"topic_id" uuid
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "membership_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "owned_post_insights" (
	"workspace_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"reach" bigint,
	"views" bigint,
	"saves" bigint,
	"shares" bigint,
	"profile_visits" bigint,
	"follows" bigint,
	CONSTRAINT "owned_post_insights_post_id_captured_at_pk" PRIMARY KEY("post_id","captured_at")
);
--> statement-breakpoint
CREATE TABLE "professional_profiles" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"council" text NOT NULL,
	"council_number" text NOT NULL,
	"council_uf" char(2) NOT NULL,
	"specialties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"connected_account_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"status" "publication_status" DEFAULT 'scheduled' NOT NULL,
	"platform_post_id" text,
	"post_id" uuid,
	"idempotency_key" text NOT NULL,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publications_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "usage_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "usage_kind" NOT NULL,
	"units" numeric(14, 4) NOT NULL,
	"cost_usd" numeric(12, 6) NOT NULL,
	"ref_id" text
);
--> statement-breakpoint
CREATE TABLE "workspace_references" (
	"workspace_id" uuid NOT NULL,
	"source_account_id" uuid NOT NULL,
	"weight" numeric(4, 2) DEFAULT '1' NOT NULL,
	"reason" "reference_reason" DEFAULT 'user' NOT NULL,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_references_workspace_id_source_account_id_pk" PRIMARY KEY("workspace_id","source_account_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_style_targets" (
	"workspace_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	"own_weight" real NOT NULL,
	"reference_mix" jsonb NOT NULL,
	"learned_adjustments" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"profile" jsonb NOT NULL,
	CONSTRAINT "workspace_style_targets_workspace_id_version_pk" PRIMARY KEY("workspace_id","version")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"billing_account_id" uuid NOT NULL,
	"vertical_version_id" uuid,
	"name" text NOT NULL,
	"autonomy_level" "autonomy_level" DEFAULT 'assisted' NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_relations" ADD CONSTRAINT "account_relations_from_account_id_source_accounts_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."source_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_relations" ADD CONSTRAINT "account_relations_to_account_id_source_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."source_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD CONSTRAINT "account_snapshots_account_id_source_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."source_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_style_profiles" ADD CONSTRAINT "account_style_profiles_account_id_source_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."source_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_embeddings" ADD CONSTRAINT "post_embeddings_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_features" ADD CONSTRAINT "post_features_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_metric_snapshots" ADD CONSTRAINT "post_metric_snapshots_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_performance" ADD CONSTRAINT "post_performance_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_topics" ADD CONSTRAINT "post_topics_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_topics" ADD CONSTRAINT "post_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_account_id_source_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."source_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_jobs" ADD CONSTRAINT "crawl_jobs_source_account_id_source_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."source_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_fetch_log" ADD CONSTRAINT "source_fetch_log_source_account_id_source_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."source_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_rules" ADD CONSTRAINT "compliance_rules_vertical_id_verticals_id_fk" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_vertical_id_verticals_id_fk" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_parent_id_topics_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vertical_versions" ADD CONSTRAINT "vertical_versions_vertical_id_verticals_id_fk" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_variant_id_content_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."content_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_owner_user_id_auth_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_settings" ADD CONSTRAINT "brand_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_checks" ADD CONSTRAINT "compliance_checks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_checks" ADD CONSTRAINT "compliance_checks_run_id_compliance_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."compliance_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_checks" ADD CONSTRAINT "compliance_checks_rule_id_compliance_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."compliance_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_overrides" ADD CONSTRAINT "compliance_overrides_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_overrides" ADD CONSTRAINT "compliance_overrides_check_id_compliance_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."compliance_checks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_overrides" ADD CONSTRAINT "compliance_overrides_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_runs" ADD CONSTRAINT "compliance_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_runs" ADD CONSTRAINT "compliance_runs_variant_id_content_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."content_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_source_account_id_source_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."source_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_variants" ADD CONSTRAINT "content_variants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_variants" ADD CONSTRAINT "content_variants_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_variants" ADD CONSTRAINT "content_variants_generation_run_id_generation_runs_id_fk" FOREIGN KEY ("generation_run_id") REFERENCES "public"."generation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_feed_items" ADD CONSTRAINT "discovery_feed_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_feed_items" ADD CONSTRAINT "discovery_feed_items_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_tags" ADD CONSTRAINT "interest_tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_tags" ADD CONSTRAINT "interest_tags_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owned_post_insights" ADD CONSTRAINT "owned_post_insights_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owned_post_insights" ADD CONSTRAINT "owned_post_insights_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_profiles" ADD CONSTRAINT "professional_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_variant_id_content_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."content_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_connected_account_id_connected_accounts_id_fk" FOREIGN KEY ("connected_account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_references" ADD CONSTRAINT "workspace_references_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_references" ADD CONSTRAINT "workspace_references_source_account_id_source_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."source_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_style_targets" ADD CONSTRAINT "workspace_style_targets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_billing_account_id_billing_accounts_id_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."billing_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_vertical_version_id_vertical_versions_id_fk" FOREIGN KEY ("vertical_version_id") REFERENCES "public"."vertical_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_accounts_user_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "post_embeddings_hnsw_idx" ON "post_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "posts_account_published_idx" ON "posts" USING btree ("account_id","published_at");--> statement-breakpoint
CREATE INDEX "source_accounts_handle_idx" ON "source_accounts" USING btree ("platform","handle");--> statement-breakpoint
CREATE INDEX "audit_log_workspace_idx" ON "audit_log" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "content_items_workspace_status_idx" ON "content_items" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "publications_due_idx" ON "publications" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "usage_ledger_workspace_time_idx" ON "usage_ledger" USING btree ("workspace_id","occurred_at");