import {
  AUTONOMY_LEVELS,
  COMPLIANCE_SEVERITIES,
  CONTENT_STATUSES,
  MEMBERSHIP_ROLES,
  PLATFORMS,
} from "@destra/shared";
import { pgEnum } from "drizzle-orm/pg-core";

export const platformEnum = pgEnum("platform", PLATFORMS);
export const autonomyLevelEnum = pgEnum("autonomy_level", AUTONOMY_LEVELS);
export const membershipRoleEnum = pgEnum("membership_role", MEMBERSHIP_ROLES);
export const contentStatusEnum = pgEnum("content_status", CONTENT_STATUSES);
export const complianceSeverityEnum = pgEnum("compliance_severity", COMPLIANCE_SEVERITIES);

export const complianceRuleKindEnum = pgEnum("compliance_rule_kind", [
  "lexicon",
  "regex",
  "llm_judge",
  "lexicon_llm",
  "required_field",
]);
export const accountTypeEnum = pgEnum("account_type", [
  "business",
  "creator",
  "personal",
  "unknown",
]);
export const crawlTierEnum = pgEnum("crawl_tier", ["hot", "warm", "cold"]);
export const sourceAccountStatusEnum = pgEnum("source_account_status", [
  "active",
  "private",
  "gone",
  "blocked",
]);
export const postFormatEnum = pgEnum("post_format", [
  "image",
  "carousel",
  "reel",
  "video",
  "short",
  "story",
  "text",
  "thread",
  "document",
]);
export const ingestionSourceEnum = pgEnum("ingestion_source", ["official_api", "vendor", "manual"]);
export const mediaTypeEnum = pgEnum("media_type", ["image", "video"]);
export const embeddingKindEnum = pgEnum("embedding_kind", [
  "caption",
  "transcript",
  "visual",
  "combined",
]);
export const accountRelationKindEnum = pgEnum("account_relation_kind", [
  "mention",
  "collab",
  "tagged",
  "co_hashtag",
]);
export const connectionStatusEnum = pgEnum("connection_status", [
  "active",
  "expired",
  "revoked",
  "error",
]);
export const referenceReasonEnum = pgEnum("reference_reason", [
  "user",
  "seed_pack",
  "discovery_accept",
]);
export const feedItemStatusEnum = pgEnum("feed_item_status", [
  "shown",
  "saved",
  "dismissed",
  "used",
]);
export const variantComplianceStatusEnum = pgEnum("variant_compliance_status", [
  "pending",
  "pass",
  "warn",
  "block",
]);
export const complianceTriggerEnum = pgEnum("compliance_trigger", [
  "generated",
  "edited",
  "rule_update",
  "manual",
]);
export const complianceDecisionEnum = pgEnum("compliance_decision", ["pass", "review", "block"]);
export const checkResultEnum = pgEnum("check_result", ["pass", "warn", "block"]);
export const approvalDecisionEnum = pgEnum("approval_decision", [
  "approved",
  "rejected",
  "changes_requested",
]);
export const publicationStatusEnum = pgEnum("publication_status", [
  "scheduled",
  "publishing",
  "published",
  "failed",
  "cancelled",
]);
export const usageKindEnum = pgEnum("usage_kind", [
  "llm_analysis",
  "llm_generation",
  "llm_compliance",
  "embedding",
  "transcription",
  "vendor_fetch",
  "platform_api",
]);
export const crawlJobKindEnum = pgEnum("crawl_job_kind", [
  "profile",
  "recent_posts",
  "metrics_refresh",
]);
export const jobStatusEnum = pgEnum("job_status", ["queued", "running", "done", "failed"]);
