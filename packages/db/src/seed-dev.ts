import { createDb } from "./client.js";
import { seedDemoReviewQueue } from "./seed.js";

/** Usage: DATABASE_URL=<owner url> pnpm --filter @destra/db seed:dev <workspaceId> */
const url = process.env.DATABASE_URL;
const workspaceId = process.argv[2];
if (!url || !workspaceId) {
  console.error("Usage: DATABASE_URL=<owner url> pnpm --filter @destra/db seed:dev <workspaceId>");
  process.exit(1);
}
const handle = createDb(url);
try {
  const { contentItemIds } = await seedDemoReviewQueue(handle.db, workspaceId);
  console.log(`Seeded ${contentItemIds.length} items into the review queue of ${workspaceId}`);
} finally {
  await handle.close();
}
