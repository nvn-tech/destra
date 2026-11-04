import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
  close: () => Promise<void>;
}

export function createDb(connectionString: string, options: { max?: number } = {}): DbHandle {
  const pool = new pg.Pool({ connectionString, max: options.max ?? 10 });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

export interface TenantContext {
  /** Authenticated user id, or a system actor such as "system:worker". */
  userId: string;
  /** Workspace the request acts on. Omit for user-level calls (e.g., listing workspaces). */
  workspaceId?: string;
}

/**
 * Runs `fn` in a transaction with the tenant context set for row-level security.
 * Settings are transaction-local, so they never leak to other pooled connections.
 * Callers must have verified the user's membership before passing a workspaceId.
 */
export async function withTenant<T>(
  db: Database,
  ctx: TenantContext,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.user_id', ${ctx.userId}, true), set_config('app.workspace_id', ${ctx.workspaceId ?? ""}, true)`,
    );
    return fn(tx);
  });
}
