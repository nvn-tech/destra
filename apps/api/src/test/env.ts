import { testDatabaseUrls } from "@destra/db/testing";

export const DB_NAME = "destra_test_api";
export const APP_URL = testDatabaseUrls(DB_NAME).app;
