import { randomUUID } from "node:crypto";
import { auditLog, createDb, type DbHandle } from "@destra/db";
import { testDatabaseUrls } from "@destra/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createActivities } from "./activities/index.js";
import { DB_NAME } from "./test/global-setup.js";

const { owner: OWNER_URL, app: APP_URL } = testDatabaseUrls(DB_NAME);

let app: DbHandle;
let owner: DbHandle;

beforeAll(() => {
  app = createDb(APP_URL);
  owner = createDb(OWNER_URL);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("worker activities", () => {
  it("checks the database as the app role", async () => {
    const result = await createActivities(app.db).checkDatabase();
    expect(result.ok).toBe(true);
    expect(result.at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("records system events in the audit log without a workspace", async () => {
    const marker = randomUUID();
    await createActivities(app.db).recordSystemEvent({
      action: "system.check",
      payload: { marker },
    });

    // System rows aren't visible to the app role (no workspace), so read them as the owner.
    const rows = await owner.db.select().from(auditLog).where(eq(auditLog.action, "system.check"));
    const row = rows.find((r) => (r.payload as { marker?: string }).marker === marker);
    expect(row).toMatchObject({ actor: "system:worker", workspaceId: null });
    expect(row?.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
