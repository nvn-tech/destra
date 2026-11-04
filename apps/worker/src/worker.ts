import { fileURLToPath } from "node:url";
import type { Database } from "@destra/db";
import { type NativeConnection, Worker } from "@temporalio/worker";
import { createActivities } from "./activities/index.js";

/** Path to the workflows module, as .ts in development and .js once built. */
export const workflowsPath = fileURLToPath(
  new URL(`./workflows/index${import.meta.url.endsWith(".ts") ? ".ts" : ".js"}`, import.meta.url),
);

export async function createWorker(options: {
  connection: NativeConnection;
  namespace: string;
  taskQueue: string;
  db: Database;
}): Promise<Worker> {
  return Worker.create({
    connection: options.connection,
    namespace: options.namespace,
    taskQueue: options.taskQueue,
    workflowsPath,
    activities: createActivities(options.db),
  });
}
