import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle, withTenant } from "./client.js";
import { auditLog, contentItems, memberships } from "./schema/index.js";
import { APP_URL, OWNER_URL } from "./test/env.js";
import { createUser, createWorkspaceAs, expectDbError, workspaceNames } from "./test/fixtures.js";

let owner: DbHandle;
let app: DbHandle;

beforeAll(() => {
  owner = createDb(OWNER_URL);
  app = createDb(APP_URL);
});

afterAll(async () => {
  await owner.close();
  await app.close();
});

describe("row-level security", () => {
  it("enables and forces RLS on every table that has a workspace_id column", async () => {
    const result = await owner.pool.query<{ table_name: string; rls: boolean; forced: boolean }>(`
      SELECT c.relname AS table_name, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relkind = 'r'
        AND EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'workspace_id' AND NOT a.attisdropped)
    `);
    expect(result.rows.length).toBeGreaterThan(15);
    const unprotected = result.rows.filter((r) => !r.rls || !r.forced).map((r) => r.table_name);
    expect(unprotected).toEqual([]);
  });

  it("shows each user only the workspaces they belong to", async () => {
    const ana = await createUser(owner.db, "Ana");
    const bruno = await createUser(owner.db, "Bruno");
    await createWorkspaceAs(app.db, ana, "Dra. Ana");
    await createWorkspaceAs(app.db, bruno, "Dr. Bruno");

    expect(await workspaceNames(app.db, ana)).toEqual(["Dra. Ana"]);
    expect(await workspaceNames(app.db, bruno)).toEqual(["Dr. Bruno"]);
  });

  it("does not let a user add themselves to someone else's workspace", async () => {
    const ana = await createUser(owner.db, "Ana");
    const intruder = await createUser(owner.db, "Intruder");
    const { workspaceId } = await createWorkspaceAs(app.db, ana, "Dra. Ana");

    await expectDbError(
      withTenant(app.db, { userId: intruder }, (tx) =>
        tx.insert(memberships).values({ workspaceId, userId: intruder, role: "owner" }),
      ),
      /row-level security/,
    );
  });

  it("scopes workspace data to the workspace in context", async () => {
    const ana = await createUser(owner.db, "Ana");
    const bruno = await createUser(owner.db, "Bruno");
    const a = await createWorkspaceAs(app.db, ana, "Dra. Ana");
    const b = await createWorkspaceAs(app.db, bruno, "Dr. Bruno");

    await withTenant(app.db, { userId: ana, workspaceId: a.workspaceId }, (tx) =>
      tx.insert(contentItems).values({
        workspaceId: a.workspaceId,
        title: "5 mitos sobre a tireoide",
        createdBy: `user:${ana}`,
      }),
    );

    const visibleToAna = await withTenant(
      app.db,
      { userId: ana, workspaceId: a.workspaceId },
      (tx) => tx.select().from(contentItems),
    );
    const visibleToBruno = await withTenant(
      app.db,
      { userId: bruno, workspaceId: b.workspaceId },
      (tx) => tx.select().from(contentItems),
    );
    const visibleWithoutContext = await withTenant(app.db, { userId: ana }, (tx) =>
      tx.select().from(contentItems),
    );

    expect(visibleToAna.map((c) => c.title)).toEqual(["5 mitos sobre a tireoide"]);
    expect(visibleToBruno).toEqual([]);
    expect(visibleWithoutContext).toEqual([]);
  });

  it("rejects writes into a workspace other than the one in context", async () => {
    const ana = await createUser(owner.db, "Ana");
    const bruno = await createUser(owner.db, "Bruno");
    const a = await createWorkspaceAs(app.db, ana, "Dra. Ana");
    const b = await createWorkspaceAs(app.db, bruno, "Dr. Bruno");

    await expectDbError(
      withTenant(app.db, { userId: bruno, workspaceId: b.workspaceId }, (tx) =>
        tx.insert(contentItems).values({ workspaceId: a.workspaceId, createdBy: `user:${bruno}` }),
      ),
      /row-level security/,
    );
  });

  it("does not leak the tenant context to the next query on a pooled connection", async () => {
    const ana = await createUser(owner.db, "Ana");
    const { workspaceId } = await createWorkspaceAs(app.db, ana, "Dra. Ana");
    await withTenant(app.db, { userId: ana, workspaceId }, async () => {});

    const client = await app.pool.connect();
    try {
      const res = await client.query("select current_setting('app.workspace_id', true) as ws");
      expect(res.rows[0]?.ws ?? "").toBe("");
    } finally {
      client.release();
    }
  });
});

describe("audit log", () => {
  it("chains each entry to the previous one in the same workspace", async () => {
    const ana = await createUser(owner.db, "Ana");
    const { workspaceId } = await createWorkspaceAs(app.db, ana, "Dra. Ana");
    const ctx = { userId: ana, workspaceId };

    await withTenant(app.db, ctx, async (tx) => {
      await tx
        .insert(auditLog)
        .values({ workspaceId, actor: ana, action: "variant.approved", entity: "content_variant" });
      await tx.insert(auditLog).values({
        workspaceId,
        actor: ana,
        action: "publication.scheduled",
        entity: "publication",
      });
    });

    const rows = await withTenant(app.db, ctx, (tx) =>
      tx.select().from(auditLog).orderBy(auditLog.id),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.prevHash).toBeNull();
    expect(rows[0]?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[1]?.prevHash).toBe(rows[0]?.hash);
  });

  it("cannot be updated or deleted by the app", async () => {
    const ana = await createUser(owner.db, "Ana");
    const { workspaceId } = await createWorkspaceAs(app.db, ana, "Dra. Ana");
    const ctx = { userId: ana, workspaceId };
    await withTenant(app.db, ctx, (tx) =>
      tx.insert(auditLog).values({ workspaceId, actor: ana, action: "x", entity: "y" }),
    );

    await expectDbError(
      withTenant(app.db, ctx, (tx) => tx.execute(sql`update audit_log set action = 'tampered'`)),
      /permission denied/,
    );
    await expectDbError(
      withTenant(app.db, ctx, (tx) => tx.execute(sql`delete from audit_log`)),
      /permission denied/,
    );
  });

  it("cannot be rewritten even by the owner role", async () => {
    await expect(owner.pool.query("update audit_log set action = 'tampered'")).rejects.toThrow(
      /append-only/,
    );
  });
});
