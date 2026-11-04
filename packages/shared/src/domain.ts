/** Platforms Destra can connect to or read from. */
export const PLATFORMS = [
  "instagram",
  "facebook",
  "threads",
  "x",
  "linkedin",
  "tiktok",
  "youtube",
] as const;
export type Platform = (typeof PLATFORMS)[number];

/** How much the AI may do on its own. See design doc, "Autonomy levels". */
export const AUTONOMY_LEVELS = ["manual", "assisted", "autopilot"] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

export const MEMBERSHIP_ROLES = ["owner", "editor", "approver", "viewer"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/** Content lifecycle, in order. `rejected` and `failed` are terminal side exits. */
export const CONTENT_STATUSES = [
  "idea",
  "drafting",
  "in_review",
  "approved",
  "scheduled",
  "published",
  "measured",
  "rejected",
  "failed",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const COMPLIANCE_SEVERITIES = ["warn", "block", "hard_block", "require_field"] as const;
export type ComplianceSeverity = (typeof COMPLIANCE_SEVERITIES)[number];

/** Embedding vector size used across the corpus. Changing it means re-embedding everything. */
export const EMBEDDING_DIMENSIONS = 1024;
