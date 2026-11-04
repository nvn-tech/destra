import { EMBEDDING_DIMENSIONS } from "@destra/shared";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import {
  accountRelationKindEnum,
  accountTypeEnum,
  crawlTierEnum,
  embeddingKindEnum,
  ingestionSourceEnum,
  mediaTypeEnum,
  platformEnum,
  postFormatEnum,
  sourceAccountStatusEnum,
} from "./enums.js";
import { topics } from "./platform.js";

/*
 * Global corpus: public content shared by all tenants. No RLS here; which
 * tenant references which account lives in the tenant zone.
 */

export const sourceAccounts = pgTable(
  "source_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: platformEnum("platform").notNull(),
    platformAccountId: text("platform_account_id").notNull(),
    handle: text("handle").notNull(),
    displayName: text("display_name"),
    accountType: accountTypeEnum("account_type").notNull().default("unknown"),
    verticalIds: uuid("vertical_ids").array().notNull().default([]),
    crawlTier: crawlTierEnum("crawl_tier").notNull().default("cold"),
    /** How many workspaces reference this account; drives the crawl tier. */
    referenceCount: integer("reference_count").notNull().default(0),
    lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true }),
    status: sourceAccountStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("source_accounts_platform_account_uq").on(t.platform, t.platformAccountId),
    index("source_accounts_handle_idx").on(t.platform, t.handle),
  ],
);

export const accountSnapshots = pgTable(
  "account_snapshots",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => sourceAccounts.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    followers: bigint("followers", { mode: "number" }),
    following: bigint("following", { mode: "number" }),
    mediaCount: integer("media_count"),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.capturedAt] })],
);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => sourceAccounts.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    platformPostId: text("platform_post_id").notNull(),
    format: postFormatEnum("format").notNull(),
    caption: text("caption"),
    language: text("language"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    permalink: text("permalink"),
    hashtags: text("hashtags").array().notNull().default([]),
    mentions: text("mentions").array().notNull().default([]),
    durationS: real("duration_s"),
    mediaCount: integer("media_count"),
    /** Dedupe and near-copy detection. */
    contentHash: text("content_hash"),
    ingestedVia: ingestionSourceEnum("ingested_via").notNull(),
    isOwnedByTenant: boolean("is_owned_by_tenant").notNull().default(false),
    /** Original payload; deleted after raw_expires_at (LGPD retention). */
    raw: jsonb("raw"),
    rawExpiresAt: timestamp("raw_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("posts_platform_post_uq").on(t.platform, t.platformPostId),
    index("posts_account_published_idx").on(t.accountId, t.publishedAt),
  ],
);

export const postMedia = pgTable(
  "post_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    type: mediaTypeEnum("type").notNull(),
    storageKey: text("storage_key"),
    width: integer("width"),
    height: integer("height"),
    durationS: real("duration_s"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [unique("post_media_post_position_uq").on(t.postId, t.position)],
);

export const postMetricSnapshots = pgTable(
  "post_metric_snapshots",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    /** Post age at capture, so posts are compared at the same age. */
    ageHours: real("age_hours"),
    likes: bigint("likes", { mode: "number" }),
    comments: bigint("comments", { mode: "number" }),
    views: bigint("views", { mode: "number" }),
    shares: bigint("shares", { mode: "number" }),
    saves: bigint("saves", { mode: "number" }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.capturedAt] })],
);

export const postFeatures = pgTable(
  "post_features",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    extractorVersion: text("extractor_version").notNull(),
    structural: jsonb("structural"),
    voice: jsonb("voice"),
    visual: jsonb("visual"),
    transcript: text("transcript"),
    ocrText: text("ocr_text"),
    /** Themes and sentiment only; never commenter identities. */
    commentSummary: jsonb("comment_summary"),
    /** Compliance pre-scan result; flagged posts are excluded from style learning. */
    complianceFlags: jsonb("compliance_flags"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.extractorVersion] })],
);

export const postEmbeddings = pgTable(
  "post_embeddings",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    kind: embeddingKindEnum("kind").notNull(),
    model: text("model").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.kind, t.model] }),
    index("post_embeddings_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export const postTopics = pgTable(
  "post_topics",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id),
    confidence: real("confidence").notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.topicId] })],
);

export const postPerformance = pgTable("post_performance", {
  postId: uuid("post_id")
    .primaryKey()
    .references(() => posts.id, { onDelete: "cascade" }),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
  engagementRate: real("engagement_rate"),
  /** z-score against the account's own 90-day baseline. */
  erVsAccountZ: real("er_vs_account_z"),
  percentileInAccount: real("percentile_in_account"),
  percentileInVertical: real("percentile_in_vertical"),
});

export const accountStyleProfiles = pgTable(
  "account_style_profiles",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => sourceAccounts.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
    sampleSize: integer("sample_size").notNull(),
    windowDays: integer("window_days").notNull(),
    profile: jsonb("profile").notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.version] })],
);

export const accountRelations = pgTable(
  "account_relations",
  {
    fromAccountId: uuid("from_account_id")
      .notNull()
      .references(() => sourceAccounts.id, { onDelete: "cascade" }),
    toAccountId: uuid("to_account_id")
      .notNull()
      .references(() => sourceAccounts.id, { onDelete: "cascade" }),
    kind: accountRelationKindEnum("kind").notNull(),
    weight: real("weight").notNull().default(1),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.fromAccountId, t.toAccountId, t.kind] })],
);
