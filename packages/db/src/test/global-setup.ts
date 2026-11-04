import { recreateTestDatabase } from "../testing.js";
import { DB_NAME } from "./env.js";

export default async function setup(): Promise<void> {
  await recreateTestDatabase(DB_NAME);
}
