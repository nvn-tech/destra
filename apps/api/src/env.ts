import { loadEnv } from "@destra/shared";
import { z } from "zod";

export const apiEnvShape = {
  DATABASE_APP_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().default(4000),
  API_PUBLIC_URL: z.string().url().default("http://localhost:4000"),
  PANEL_URL: z.string().url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
};

export type ApiEnv = ReturnType<typeof loadApiEnv>;

export function loadApiEnv(source: Record<string, string | undefined> = process.env) {
  return loadEnv(apiEnvShape, source);
}
