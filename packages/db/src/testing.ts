import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * Test helper: drops and recreates `name`, then applies all migrations.
 * Each package's suite uses its own database so suites can run in parallel.
 */
export async function recreateTestDatabase(name: string, host = testDatabaseHost()): Promise<void> {
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Invalid test database name: ${name}`);
  const admin = new pg.Client({ connectionString: `postgres://destra:destra@${host}/postgres` });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  await runMigrations(testDatabaseUrls(name, host).owner);
}

export function testDatabaseHost(): string {
  return process.env.TEST_DATABASE_HOST ?? "localhost:5432";
}

/** Owner (migrations, fixtures) and app-role (RLS enforced) URLs for a test database. */
export function testDatabaseUrls(name: string, host = testDatabaseHost()) {
  return {
    owner: `postgres://destra:destra@${host}/${name}`,
    app: `postgres://destra_api:destra_api@${host}/${name}`,
  };
}
