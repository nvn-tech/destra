import { loadEnv } from "@destra/shared";
import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

export const apiEnvShape = {
  DATABASE_APP_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().default(4000),
  API_PUBLIC_URL: z.string().url().default("http://localhost:4000"),
  PANEL_URL: z.string().url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,

  // Meta (Instagram via Facebook Login). The integration is off until all of these are set.
  META_APP_ID: optional,
  META_APP_SECRET: optional,
  META_GRAPH_VERSION: z.string().default("v26.0"),
  META_GRAPH_URL: z.string().url().default("https://graph.facebook.com"),
  META_DIALOG_URL: z.string().url().default("https://www.facebook.com"),
  /** 32 random bytes, base64. Encrypts platform tokens at rest. */
  TOKEN_ENCRYPTION_KEY: optional,

  // Temporal. Without it, background jobs are logged and skipped (local development).
  TEMPORAL_ADDRESS: optional,
  TEMPORAL_NAMESPACE: z.string().default("default"),
  TEMPORAL_TASK_QUEUE: z.string().default("destra-main"),
};

export type ApiEnv = ReturnType<typeof loadApiEnv>;

export function loadApiEnv(source: Record<string, string | undefined> = process.env) {
  return loadEnv(apiEnvShape, source);
}
