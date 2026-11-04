-- Extensions and the application role. Runs before any table is created.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
-- destra_app: the group role the running app uses. No login, no RLS bypass.
-- Each environment creates a login role that is a member of it (see scripts/setup-local-db.sql).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'destra_app') THEN
    CREATE ROLE destra_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS app;
