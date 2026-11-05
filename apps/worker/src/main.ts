import { createDb, createVault, parseVaultKey } from "@destra/db";
import { GraphClient } from "@destra/meta";
import { NativeConnection } from "@temporalio/worker";
import { loadWorkerEnv } from "./env.js";
import { createWorker } from "./worker.js";

const env = loadWorkerEnv();
const handle = createDb(env.DATABASE_APP_URL);
const meta =
  env.META_APP_ID && env.META_APP_SECRET && env.TOKEN_ENCRYPTION_KEY
    ? {
        graph: new GraphClient({
          appId: env.META_APP_ID,
          appSecret: env.META_APP_SECRET,
          graphVersion: env.META_GRAPH_VERSION,
          graphUrl: env.META_GRAPH_URL,
          dialogUrl: "https://www.facebook.com",
          redirectUri: "",
        }),
        vault: createVault([parseVaultKey(env.TOKEN_ENCRYPTION_KEY)]),
      }
    : null;
if (!meta) console.warn("Meta integration not configured: Instagram activities will fail fast.");
const connection = await NativeConnection.connect({ address: env.TEMPORAL_ADDRESS });
const worker = await createWorker({
  connection,
  namespace: env.TEMPORAL_NAMESPACE,
  taskQueue: env.TEMPORAL_TASK_QUEUE,
  db: handle.db,
  meta,
});

try {
  await worker.run();
} finally {
  await connection.close();
  await handle.close();
}
