import { randomUUID } from "node:crypto";
import { createDb, type DbHandle } from "@destra/db";
import { testDatabaseUrls } from "@destra/db/testing";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createActivities } from "./activities/index.js";
import { DB_NAME } from "./test/global-setup.js";
import { workflowsPath } from "./worker.js";
import { systemCheckWorkflow } from "./workflows/index.js";

const APP_URL = testDatabaseUrls(DB_NAME).app;

// Starts a local Temporal dev server (downloaded on first run). Set SKIP_TEMPORAL_TESTS=1
// where that download isn't possible; CI always runs it.
const skip = process.env.SKIP_TEMPORAL_TESTS === "1";

let env: TestWorkflowEnvironment;
let db: DbHandle;

beforeAll(async () => {
  if (skip) return;
  env = await TestWorkflowEnvironment.createLocal();
  db = createDb(APP_URL);
});

afterAll(async () => {
  await env?.teardown();
  await db?.close();
});

describe.skipIf(skip)("systemCheckWorkflow", () => {
  it("runs end to end against Temporal and the database", async () => {
    const taskQueue = `test-${randomUUID()}`;
    const worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue,
      workflowsPath,
      activities: createActivities(db.db),
    });

    const result = await worker.runUntil(
      env.client.workflow.execute(systemCheckWorkflow, {
        taskQueue,
        workflowId: `system-check-${randomUUID()}`,
        args: ["test"],
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.at).not.toBe("");
  });
});
