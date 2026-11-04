import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { withTenant } from "../client.js";
import { authUsers, billingAccounts, memberships, workspaces } from "../schema/index.js";

/** Inserts an auth user directly (auth tables are not tenant-scoped). */
export async function createUser(owner: Database, name: string): Promise<string> {
  const id = `user_${randomUUID()}`;
  await owner.insert(authUsers).values({ id, name, email: `${id}@example.com` });
  return id;
}

/** Creates a billing account, a workspace and the owner membership, as the user (RLS on). */
export async function createWorkspaceAs(app: Database, userId: string, name: string) {
  const billingAccountId = randomUUID();
  const workspaceId = randomUUID();
  await withTenant(app, { userId }, async (tx) => {
    await tx
      .insert(billingAccounts)
      .values({ id: billingAccountId, legalName: name, ownerUserId: userId });
    await tx.insert(workspaces).values({ id: workspaceId, billingAccountId, name });
    await tx.insert(memberships).values({ workspaceId, userId, role: "owner" });
  });
  return { billingAccountId, workspaceId };
}

export async function workspaceNames(app: Database, userId: string): Promise<string[]> {
  return withTenant(app, { userId }, async (tx) => {
    const rows = await tx.select({ name: workspaces.name }).from(workspaces);
    return rows.map((r) => r.name).sort();
  });
}

export { eq };

/** Drizzle wraps driver errors; this checks the underlying Postgres message. */
export async function expectDbError(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await promise;
  } catch (error) {
    const messages: string[] = [];
    let current: unknown = error;
    while (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
    }
    if (messages.some((m) => pattern.test(m))) return;
    throw new Error(`Expected a database error matching ${pattern}, got: ${messages.join(" <- ")}`);
  }
  throw new Error(`Expected a database error matching ${pattern}, but the query succeeded`);
}
