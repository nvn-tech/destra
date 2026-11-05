// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: local dev script configured from the shell environment
// Local development without Temporal: publishes every due publication once.

import { createPublishingActivities } from "../apps/worker/dist/activities/publishing.js";
import { createDb, createVault, parseVaultKey } from "../packages/db/dist/index.js";
import { LocalMediaStore } from "../packages/media/dist/index.js";
import { GraphClient } from "../packages/meta/dist/index.js";

const env = process.env;
const app = createDb(env.DATABASE_APP_URL);
const owner = createDb(env.DATABASE_URL);
const activities = createPublishingActivities(app.db, {
  graph: new GraphClient({
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    graphVersion: "v26.0",
    graphUrl: env.META_GRAPH_URL,
    dialogUrl: "",
    redirectUri: "",
  }),
  vault: createVault([parseVaultKey(env.TOKEN_ENCRYPTION_KEY)]),
  store: new LocalMediaStore(
    env.MEDIA_LOCAL_DIR,
    env.MEDIA_PUBLIC_BASE_URL,
    env.MEDIA_SIGNING_SECRET,
  ),
  pollIntervalMs: 500,
});
const { rows } = await owner.pool.query(
  "select id, workspace_id from publications where status = 'scheduled' and scheduled_at <= now() + interval '1 minute'",
);
for (const r of rows)
  console.log(
    r.id,
    await activities.publishPublication({ workspaceId: r.workspace_id, publicationId: r.id }),
  );
await app.close();
await owner.close();
