import { recreateTestDatabase } from "@destra/db/testing";

export const DB_NAME = "destra_test_worker";

export default async function setup(): Promise<void> {
  await recreateTestDatabase(DB_NAME);
}
