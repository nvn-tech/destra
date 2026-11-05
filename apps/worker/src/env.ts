import { loadEnv } from "@destra/shared";
import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

export function loadWorkerEnv(source: Record<string, string | undefined> = process.env) {
  return loadEnv(
    {
      DATABASE_APP_URL: z.string().min(1),
      TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
      TEMPORAL_NAMESPACE: z.string().default("default"),
      TEMPORAL_TASK_QUEUE: z.string().default("destra-main"),
      META_APP_ID: optional,
      META_APP_SECRET: optional,
      META_GRAPH_VERSION: z.string().default("v26.0"),
      META_GRAPH_URL: z.string().url().default("https://graph.facebook.com"),
      TOKEN_ENCRYPTION_KEY: optional,
      // Media for publishing: a private S3 bucket in production, or a local folder in development.
      MEDIA_S3_BUCKET: optional,
      MEDIA_S3_REGION: z.string().default("sa-east-1"),
      MEDIA_S3_ENDPOINT: optional,
      MEDIA_LOCAL_DIR: optional,
      MEDIA_PUBLIC_BASE_URL: optional,
      MEDIA_SIGNING_SECRET: optional,
    },
    source,
  );
}
