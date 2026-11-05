// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: local dev script configured from the shell environment
// Local development without Temporal: runs the Instagram import for every active connection once.

import { createInstagramActivities } from "../apps/worker/dist/activities/instagram.js";
import { createDb, createVault, parseVaultKey } from "../packages/db/dist/index.js";
import { GraphClient } from "../packages/meta/dist/index.js";

const app = createDb(process.env.DATABASE_APP_URL);
const owner = createDb(process.env.DATABASE_URL);
const activities = createInstagramActivities(app.db, {
  graph: new GraphClient({
    appId: process.env.META_APP_ID,
    appSecret: process.env.META_APP_SECRET,
    graphVersion: "v26.0",
    graphUrl: process.env.META_GRAPH_URL,
    dialogUrl: "",
    redirectUri: "",
  }),
  vault: createVault([parseVaultKey(process.env.TOKEN_ENCRYPTION_KEY)]),
});
const { rows: connections } = await owner.pool.query(
  "select id, workspace_id from connected_accounts where status = 'active'",
);
for (const c of connections)
  console.log(
    await activities.ingestOwnAccount({ workspaceId: c.workspace_id, connectedAccountId: c.id }),
  );
const { rows: refs } = await owner.pool.query(
  "select workspace_id, source_account_id from workspace_references",
);
for (const r of refs)
  console.log(
    await activities.syncReferenceAccount({
      workspaceId: r.workspace_id,
      sourceAccountId: r.source_account_id,
    }),
  );
await app.close();
await owner.close();
