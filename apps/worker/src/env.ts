import { loadEnv } from "@destra/shared";
import { z } from "zod";

export function loadWorkerEnv(source: Record<string, string | undefined> = process.env) {
  return loadEnv(
    {
      DATABASE_APP_URL: z.string().min(1),
      TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
      TEMPORAL_NAMESPACE: z.string().default("default"),
      TEMPORAL_TASK_QUEUE: z.string().default("destra-main"),
    },
    source,
  );
}
