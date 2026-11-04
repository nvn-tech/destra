import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client.js";

/** Applies migrations with the owner connection (DATABASE_URL). */
export async function runMigrations(connectionString: string): Promise<void> {
  const handle = createDb(connectionString, { max: 1 });
  try {
    const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
    await migrate(handle.db, { migrationsFolder });
  } finally {
    await handle.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  runMigrations(url)
    .then(() => console.log("Migrations applied"))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
