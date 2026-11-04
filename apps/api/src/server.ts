import { createDb } from "@destra/db";
import { buildApp } from "./app.js";
import { loadApiEnv } from "./env.js";

const env = loadApiEnv();
const handle = createDb(env.DATABASE_APP_URL);
const { app } = await buildApp({ env, db: handle.db });

const shutdown = async () => {
  await app.close();
  await handle.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
