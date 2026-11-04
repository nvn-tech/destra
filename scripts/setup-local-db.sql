-- Local and CI setup. Run as a superuser:  psql -f scripts/setup-local-db.sql
-- Creates the owner role (runs migrations) and the API login role (member of destra_app).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'destra') THEN
    CREATE ROLE destra LOGIN SUPERUSER PASSWORD 'destra';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'destra_app') THEN
    CREATE ROLE destra_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'destra_api') THEN
    CREATE ROLE destra_api LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD 'destra_api' IN ROLE destra_app;
  END IF;
END
$$;
