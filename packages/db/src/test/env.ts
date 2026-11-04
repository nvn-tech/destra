import { testDatabaseUrls } from "../testing.js";

export const DB_NAME = "destra_test_db";
const urls = testDatabaseUrls(DB_NAME);
export const OWNER_URL = urls.owner;
export const APP_URL = urls.app;
