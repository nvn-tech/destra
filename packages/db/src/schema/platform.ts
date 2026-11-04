import { EMBEDDING_DIMENSIONS } from "@destra/shared";
import {
  type AnyPgColumn,
  boolean,
  char,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { complianceRuleKindEnum, complianceSeverityEnum } from "./enums.js";

/** A niche with its own regulator and rule pack, e.g. `medicina-br`. */
export const verticals = pgTable("verticals", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  country: char("country", { length: 2 }).notNull(),
  language: text("language").notNull(),
  regulator: text("regulator").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Immutable config snapshot of a vertical pack (prompts, presets, templates, required fields). */
export const verticalVersions = pgTable(
  "vertical_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    verticalId: uuid("vertical_id")
      .notNull()
      .references(() => verticals.id),
    version: integer("version").notNull(),
    config: jsonb("config").notNull().default({}),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [unique("vertical_versions_vertical_version_uq").on(t.verticalId, t.version)],
);

export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    verticalId: uuid("vertical_id")
      .notNull()
      .references(() => verticals.id),
    parentId: uuid("parent_id").references((): AnyPgColumn => topics.id),
    slug: text("slug").notNull(),
    labelPt: text("label_pt").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
  },
  (t) => [unique("topics_vertical_slug_uq").on(t.verticalId, t.slug)],
);

export const complianceRules = pgTable(
  "compliance_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    verticalId: uuid("vertical_id")
      .notNull()
      .references(() => verticals.id),
    code: text("code").notNull(),
    version: integer("version").notNull(),
    severity: complianceSeverityEnum("severity").notNull(),
    kind: complianceRuleKindEnum("kind").notNull(),
    /** Rubric, lexicon, patterns, applicability and examples. */
    definition: jsonb("definition").notNull(),
    sourceReference: text("source_reference"),
    preventionHint: text("prevention_hint"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("compliance_rules_vertical_code_version_uq").on(t.verticalId, t.code, t.version)],
);
