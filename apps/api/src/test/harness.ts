import { createDb, type DbHandle } from "@destra/db";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { loadApiEnv } from "../env.js";
import type { JobQueue } from "../jobs.js";
import { APP_URL } from "./env.js";

export interface Harness {
  app: FastifyInstance;
  handle: DbHandle;
  close: () => Promise<void>;
}

export const TEST_META_APP_SECRET = "test-meta-app-secret";

/** Records background jobs instead of starting Temporal workflows. */
export class RecordingJobQueue implements JobQueue {
  backfills: { workspaceId: string; connectedAccountId: string }[] = [];
  syncs: { workspaceId: string; sourceAccountId: string }[] = [];
  async backfillOwnAccount(input: { workspaceId: string; connectedAccountId: string }) {
    this.backfills.push(input);
  }
  async syncReferenceAccount(input: { workspaceId: string; sourceAccountId: string }) {
    this.syncs.push(input);
  }
  async close() {}
}

export async function startHarness(
  options: { graphUrl?: string; jobs?: JobQueue } = {},
): Promise<Harness> {
  const env = loadApiEnv({
    DATABASE_APP_URL: APP_URL,
    BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-for-better-auth",
    API_PUBLIC_URL: "http://localhost:4000",
    PANEL_URL: "http://localhost:3000",
    ...(options.graphUrl
      ? {
          META_APP_ID: "test-app",
          META_APP_SECRET: TEST_META_APP_SECRET,
          META_GRAPH_URL: options.graphUrl,
          TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
        }
      : {}),
  });
  const handle = createDb(APP_URL);
  const { app } = await buildApp({ env, db: handle.db, logger: false, jobs: options.jobs });
  await app.ready();
  return {
    app,
    handle,
    close: async () => {
      await app.close();
      await handle.close();
    },
  };
}

let counter = 0;

/** Signs up a fresh user through Better Auth and returns the session cookie. */
export async function signUp(app: FastifyInstance, name = "Dra. Ana"): Promise<string> {
  counter += 1;
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: "http://localhost:3000", "content-type": "application/json" },
    payload: {
      name,
      email: `user${counter}-${Date.now()}@example.com`,
      password: "correct-horse-battery",
    },
  });
  if (response.statusCode !== 200) {
    throw new Error(`Sign-up failed (${response.statusCode}): ${response.body}`);
  }
  const setCookie = response.headers["set-cookie"];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.map((c) => c.split(";")[0]).join("; ");
}
