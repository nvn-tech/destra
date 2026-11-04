import {
  bigint,
  boolean,
  char,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth.js";
import { posts, sourceAccounts } from "./corpus.js";
import {
  approvalDecisionEnum,
  autonomyLevelEnum,
  checkResultEnum,
  complianceDecisionEnum,
  complianceTriggerEnum,
  connectionStatusEnum,
  contentStatusEnum,
  feedItemStatusEnum,
  membershipRoleEnum,
  platformEnum,
  postFormatEnum,
  publicationStatusEnum,
  referenceReasonEnum,
  usageKindEnum,
  variantComplianceStatusEnum,
} from "./enums.js";
import { complianceRules, topics, verticalVersions } from "./platform.js";

/*
 * Tenant zone. Every table except billing_accounts carries workspace_id and is
 * protected by row-level security (see drizzle/0002_security.sql).
 */

const workspaceId = () =>
  uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const billingAccounts = pgTable("billing_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  legalName: text("legal_name").notNull(),
  /** CNPJ or CPF, digits only. */
  taxId: text("tax_id"),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => authUsers.id),
  plan: text("plan").notNull().default("design_partner"),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  billingAccountId: uuid("billing_account_id")
    .notNull()
    .references(() => billingAccounts.id),
  verticalVersionId: uuid("vertical_version_id").references(() => verticalVersions.id),
  name: text("name").notNull(),
  autonomyLevel: autonomyLevelEnum("autonomy_level").notNull().default("assisted"),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  /** Kill switch: while set, nothing is published for this workspace. */
  publishingPausedAt: timestamp("publishing_paused_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    workspaceId: workspaceId(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("memberships_user_idx").on(t.userId),
  ],
);

/** Council registration used for the mandatory identification (e.g., CRM-SP 123456, RQE 7890). */
export const professionalProfiles = pgTable("professional_profiles", {
  workspaceId: workspaceId().primaryKey(),
  fullName: text("full_name").notNull(),
  council: text("council").notNull(),
  councilNumber: text("council_number").notNull(),
  councilUf: char("council_uf", { length: 2 }).notNull(),
  /** [{ name: string, rqe: string | null }] */
  specialties: jsonb("specialties").notNull().default([]),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
});

export const brandSettings = pgTable("brand_settings", {
  workspaceId: workspaceId().primaryKey(),
  voiceNotes: text("voice_notes"),
  bannedTerms: text("banned_terms").array().notNull().default([]),
  emojiPolicy: text("emoji_policy"),
  hashtagPolicy: text("hashtag_policy"),
  ctaPreferences: jsonb("cta_preferences"),
  visualKit: jsonb("visual_kit"),
  /** Adds "Conteúdo revisado por Dr(a)." to captions. */
  aiDisclosure: boolean("ai_disclosure").notNull().default(false),
});

export const connectedAccounts = pgTable(
  "connected_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    platform: platformEnum("platform").notNull(),
    sourceAccountId: uuid("source_account_id").references(() => sourceAccounts.id),
    platformAccountId: text("platform_account_id").notNull(),
    /** Facebook Page id for Instagram accounts connected through Facebook Login. */
    linkedPageId: text("linked_page_id"),
    /** Meta app-scoped user id; used by the deauthorization and data-deletion callbacks. */
    externalUserId: text("external_user_id"),
    /** Pointer into the secrets vault (page token for Instagram); raw tokens are never stored here. */
    tokenRef: text("token_ref").notNull(),
    /** Long-lived user token, used to refresh page tokens and list pages. */
    userTokenRef: text("user_token_ref"),
    scopes: text("scopes").array().notNull().default([]),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    status: connectionStatusEnum("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("connected_accounts_workspace_platform_uq").on(
      t.workspaceId,
      t.platform,
      t.platformAccountId,
    ),
  ],
);

/** The link between a tenant and the shared corpus. */
export const workspaceReferences = pgTable(
  "workspace_references",
  {
    workspaceId: workspaceId(),
    sourceAccountId: uuid("source_account_id")
      .notNull()
      .references(() => sourceAccounts.id),
    weight: numeric("weight", { precision: 4, scale: 2 }).notNull().default("1"),
    reason: referenceReasonEnum("reason").notNull().default("user"),
    addedBy: text("added_by"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.sourceAccountId] })],
);

export const interestTags = pgTable("interest_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: workspaceId(),
  rawTag: text("raw_tag").notNull(),
  topicId: uuid("topic_id").references(() => topics.id),
});

/** Private metrics only the owner of the post can see. */
export const ownedPostInsights = pgTable(
  "owned_post_insights",
  {
    workspaceId: workspaceId(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    reach: bigint("reach", { mode: "number" }),
    views: bigint("views", { mode: "number" }),
    saves: bigint("saves", { mode: "number" }),
    shares: bigint("shares", { mode: "number" }),
    profileVisits: bigint("profile_visits", { mode: "number" }),
    follows: bigint("follows", { mode: "number" }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.capturedAt] })],
);

export const workspaceStyleTargets = pgTable(
  "workspace_style_targets",
  {
    workspaceId: workspaceId(),
    version: integer("version").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
    ownWeight: real("own_weight").notNull(),
    referenceMix: jsonb("reference_mix").notNull(),
    learnedAdjustments: jsonb("learned_adjustments").notNull().default({}),
    profile: jsonb("profile").notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.version] })],
);

export const discoveryFeedItems = pgTable(
  "discovery_feed_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    score: real("score").notNull(),
    reasons: jsonb("reasons"),
    status: feedItemStatusEnum("status").notNull().default("shown"),
    shownAt: timestamp("shown_at", { withTimezone: true }).notNull().defaultNow(),
    actedAt: timestamp("acted_at", { withTimezone: true }),
  },
  (t) => [unique("discovery_feed_items_workspace_post_uq").on(t.workspaceId, t.postId)],
);

export const contentItems = pgTable(
  "content_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    topicId: uuid("topic_id").references(() => topics.id),
    title: text("title"),
    status: contentStatusEnum("status").notNull().default("idea"),
    strategyTags: text("strategy_tags").array().notNull().default([]),
    inspirationPostIds: uuid("inspiration_post_ids").array().notNull().default([]),
    /** Autopilot may only publish items the doctor approved in advance (CFM Res. 2.454/2026). */
    preApproved: boolean("pre_approved").notNull().default(false),
    suggestedSlot: timestamp("suggested_slot", { withTimezone: true }),
    /** "user:<id>" or "autopilot". */
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("content_items_workspace_status_idx").on(t.workspaceId, t.status)],
);

export const generationRuns = pgTable("generation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: workspaceId(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  styleTargetVersion: integer("style_target_version"),
  inputRefs: jsonb("input_refs"),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }),
  latencyMs: integer("latency_ms"),
  createdAt: createdAt(),
});

export const contentVariants = pgTable("content_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: workspaceId(),
  contentItemId: uuid("content_item_id")
    .notNull()
    .references(() => contentItems.id, { onDelete: "cascade" }),
  platform: platformEnum("platform").notNull(),
  format: postFormatEnum("format").notNull(),
  /** caption, slides[], script, shot_list, hashtags, claims[], signature */
  body: jsonb("body").notNull(),
  generationRunId: uuid("generation_run_id").references(() => generationRuns.id),
  originalityScore: real("originality_score"),
  complianceStatus: variantComplianceStatusEnum("compliance_status").notNull().default("pending"),
  isSelected: boolean("is_selected").notNull().default(false),
  createdAt: createdAt(),
});

export const complianceRuns = pgTable("compliance_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: workspaceId(),
  variantId: uuid("variant_id")
    .notNull()
    .references(() => contentVariants.id, { onDelete: "cascade" }),
  trigger: complianceTriggerEnum("trigger").notNull(),
  rulesetVersion: text("ruleset_version").notNull(),
  decision: complianceDecisionEnum("decision").notNull(),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }),
  latencyMs: integer("latency_ms"),
  createdAt: createdAt(),
});

export const complianceChecks = pgTable("compliance_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: workspaceId(),
  runId: uuid("run_id")
    .notNull()
    .references(() => complianceRuns.id, { onDelete: "cascade" }),
  ruleId: uuid("rule_id")
    .notNull()
    .references(() => complianceRules.id),
  ruleVersion: integer("rule_version").notNull(),
  result: checkResultEnum("result").notNull(),
  confidence: real("confidence"),
  /** Matched spans, judge rationale, suggested fix. */
  evidence: jsonb("evidence"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

export const complianceOverrides = pgTable("compliance_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: workspaceId(),
  checkId: uuid("check_id")
    .notNull()
    .references(() => complianceChecks.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => authUsers.id),
  /** "warn" overrides need a justification; "block" needs an explicit responsibility attestation. */
  level: text("level").notNull(),
  justification: text("justification").notNull(),
  attestedAt: timestamp("attested_at", { withTimezone: true }).notNull().defaultNow(),
});

export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: workspaceId(),
  variantId: uuid("variant_id")
    .notNull()
    .references(() => contentVariants.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => authUsers.id),
  decision: approvalDecisionEnum("decision").notNull(),
  comment: text("comment"),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
});

export const publications = pgTable(
  "publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => contentVariants.id),
    connectedAccountId: uuid("connected_account_id")
      .notNull()
      .references(() => connectedAccounts.id),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    status: publicationStatusEnum("status").notNull().default("scheduled"),
    platformPostId: text("platform_post_id"),
    /** Links the published post back into the corpus; closes the feedback loop. */
    postId: uuid("post_id").references(() => posts.id),
    /** A retry must never double-post. */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    error: jsonb("error"),
    createdAt: createdAt(),
  },
  (t) => [index("publications_due_idx").on(t.status, t.scheduledAt)],
);

export const consentRecords = pgTable("consent_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: workspaceId(),
  mediaRef: text("media_ref").notNull(),
  /** Hash of the patient's reference; never the identity itself. */
  patientRefHash: text("patient_ref_hash").notNull(),
  scope: text("scope").notNull(),
  signedDocKey: text("signed_doc_key"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    kind: usageKindEnum("kind").notNull(),
    units: numeric("units", { precision: 14, scale: 4 }).notNull(),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull(),
    refId: text("ref_id"),
  },
  (t) => [index("usage_ledger_workspace_time_idx").on(t.workspaceId, t.occurredAt)],
);

/**
 * Append-only, hash-chained audit trail. The app role can only INSERT and
 * SELECT; prev_hash and hash are filled by a trigger (drizzle/0002_security.sql).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    /** user id, "autopilot" or "system". */
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    prevHash: text("prev_hash"),
    hash: text("hash"),
  },
  (t) => [index("audit_log_workspace_idx").on(t.workspaceId, t.id)],
);

/**
 * Encrypted secrets (platform tokens). AES-256-GCM, key outside the database
 * (see vault.ts). Rows are workspace-scoped and protected by RLS.
 */
export const secrets = pgTable("secrets", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: workspaceId(),
  kind: text("kind").notNull(),
  keyId: text("key_id").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  ciphertext: text("ciphertext").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/**
 * A finished Facebook Login waiting for the user to pick which Instagram account
 * to connect (only when the login returned more than one). Short-lived.
 */
export const metaOauthGrants = pgTable("meta_oauth_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: workspaceId(),
  userId: text("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  metaUserId: text("meta_user_id").notNull(),
  userTokenSecretId: uuid("user_token_secret_id")
    .notNull()
    .references(() => secrets.id, { onDelete: "cascade" }),
  scopes: text("scopes").array().notNull().default([]),
  /** [{ pageId, pageName, instagramId, username, name, followers, canPublish }] — no secrets. */
  candidates: jsonb("candidates").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});
