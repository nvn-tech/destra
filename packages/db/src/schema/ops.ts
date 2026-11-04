import { integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sourceAccounts } from "./corpus.js";
import { crawlJobKindEnum, jobStatusEnum } from "./enums.js";

export const crawlJobs = pgTable("crawl_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceAccountId: uuid("source_account_id")
    .notNull()
    .references(() => sourceAccounts.id, { onDelete: "cascade" }),
  kind: crawlJobKindEnum("kind").notNull(),
  adapter: text("adapter").notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  status: jobStatusEnum("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Every call to a data source, with its cost; feeds the per-tenant unit economics. */
export const sourceFetchLog = pgTable("source_fetch_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  adapter: text("adapter").notNull(),
  sourceAccountId: uuid("source_account_id").references(() => sourceAccounts.id, {
    onDelete: "set null",
  }),
  itemsFetched: integer("items_fetched").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  error: text("error"),
});
