import { createDb, type DbHandle } from "@destra/db";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { loadApiEnv } from "../env.js";
import { APP_URL } from "./env.js";

export interface Harness {
  app: FastifyInstance;
  handle: DbHandle;
  close: () => Promise<void>;
}

export async function startHarness(): Promise<Harness> {
  const env = loadApiEnv({
    DATABASE_APP_URL: APP_URL,
    BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-for-better-auth",
    API_PUBLIC_URL: "http://localhost:4000",
    PANEL_URL: "http://localhost:3000",
  });
  const handle = createDb(APP_URL);
  const { app } = await buildApp({ env, db: handle.db, logger: false });
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
