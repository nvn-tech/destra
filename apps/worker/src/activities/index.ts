import { auditLog, type Database } from "@destra/db";
import { sql } from "drizzle-orm";
import { createInstagramActivities, type MetaWorkerDeps } from "./instagram.js";
import { createPublishingActivities, type PublishingDeps } from "./publishing.js";

/**
 * Activities run outside the workflow sandbox and may do I/O.
 * They are created with their dependencies so tests can pass their own.
 */
export function createActivities(
  db: Database,
  meta: MetaWorkerDeps | null = null,
  publishing: PublishingDeps | null = null,
) {
  return {
    ...createInstagramActivities(db, meta),
    ...createPublishingActivities(db, publishing),

    /** Confirms the worker can reach the database. */
    async checkDatabase(): Promise<{ ok: boolean; at: string }> {
      const result = await db.execute<{ now: string }>(sql`select now()::text as now`);
      return { ok: true, at: result.rows[0]?.now ?? "" };
    },

    /** Writes a system event (no workspace) to the audit log. */
    async recordSystemEvent(input: {
      action: string;
      payload?: Record<string, unknown>;
    }): Promise<void> {
      await db.insert(auditLog).values({
        actor: "system:worker",
        action: input.action,
        entity: "system",
        payload: input.payload ?? {},
      });
    },
  };
}

export type Activities = ReturnType<typeof createActivities>;
