import { createDb } from "@destra/db";
import { NativeConnection } from "@temporalio/worker";
import { loadWorkerEnv } from "./env.js";
import { createWorker } from "./worker.js";

const env = loadWorkerEnv();
const handle = createDb(env.DATABASE_APP_URL);
const connection = await NativeConnection.connect({ address: env.TEMPORAL_ADDRESS });
const worker = await createWorker({
  connection,
  namespace: env.TEMPORAL_NAMESPACE,
  taskQueue: env.TEMPORAL_TASK_QUEUE,
  db: handle.db,
});

try {
  await worker.run();
} finally {
  await connection.close();
  await handle.close();
}
