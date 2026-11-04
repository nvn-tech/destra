import {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
  type Database,
} from "@destra/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { ApiEnv } from "./env.js";

export function createAuth(db: Database, env: ApiEnv) {
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : undefined;

  return betterAuth({
    baseURL: env.API_PUBLIC_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.PANEL_URL],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
      },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 10 },
    socialProviders: google,
  });
}

export type Auth = ReturnType<typeof createAuth>;
