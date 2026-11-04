-- =====================================================================
-- Tenant isolation, grants and the audit trail.
-- The running app connects as a member of destra_app; RLS applies to it.
-- Context is set per transaction by withTenant(): app.user_id, app.workspace_id.
-- =====================================================================

-- ---------- Context helpers ----------
CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.current_workspace_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.workspace_id', true), '')::uuid $$;
--> statement-breakpoint
-- SECURITY DEFINER helpers read memberships without RLS, which avoids
-- recursive policies (memberships policies that query memberships).
CREATE OR REPLACE FUNCTION app.is_member(ws uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m WHERE m.workspace_id = ws AND m.user_id = app.current_user_id()
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.is_owner(ws uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.workspace_id = ws AND m.user_id = app.current_user_id() AND m.role = 'owner'
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.owns_billing_account(ba uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM billing_accounts b WHERE b.id = ba AND b.owner_user_id = app.current_user_id()
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.owns_workspace_billing(ws uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspaces w JOIN billing_accounts b ON b.id = w.billing_account_id
    WHERE w.id = ws AND b.owner_user_id = app.current_user_id()
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.is_billing_member(ba uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspaces w JOIN memberships m ON m.workspace_id = w.id
    WHERE w.billing_account_id = ba AND m.user_id = app.current_user_id()
  )
$$;
--> statement-breakpoint

-- ---------- Grants ----------
GRANT USAGE ON SCHEMA public, app TO destra_app;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO destra_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO destra_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO destra_app;
--> statement-breakpoint
-- Platform config (vertical packs, rules) is read-only for the app; it changes through migrations.
REVOKE INSERT, UPDATE, DELETE ON verticals, vertical_versions, topics, compliance_rules FROM destra_app;
--> statement-breakpoint
-- The audit log is append-only.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM destra_app;
--> statement-breakpoint
-- Tables created by later migrations get the same default grants (each must still enable RLS).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO destra_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO destra_app;
--> statement-breakpoint

-- ---------- Billing accounts, workspaces, memberships ----------
ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE billing_accounts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY billing_accounts_select ON billing_accounts FOR SELECT TO destra_app
  USING (owner_user_id = app.current_user_id() OR app.is_billing_member(id));
--> statement-breakpoint
CREATE POLICY billing_accounts_insert ON billing_accounts FOR INSERT TO destra_app
  WITH CHECK (owner_user_id = app.current_user_id());
--> statement-breakpoint
CREATE POLICY billing_accounts_update ON billing_accounts FOR UPDATE TO destra_app
  USING (owner_user_id = app.current_user_id()) WITH CHECK (owner_user_id = app.current_user_id());
--> statement-breakpoint

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspaces_select ON workspaces FOR SELECT TO destra_app
  USING (app.is_member(id) OR id = app.current_workspace_id());
--> statement-breakpoint
CREATE POLICY workspaces_insert ON workspaces FOR INSERT TO destra_app
  WITH CHECK (app.owns_billing_account(billing_account_id));
--> statement-breakpoint
CREATE POLICY workspaces_update ON workspaces FOR UPDATE TO destra_app
  USING (app.is_owner(id)) WITH CHECK (app.is_owner(id));
--> statement-breakpoint
CREATE POLICY workspaces_delete ON workspaces FOR DELETE TO destra_app
  USING (app.is_owner(id));
--> statement-breakpoint

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY memberships_select ON memberships FOR SELECT TO destra_app
  USING (user_id = app.current_user_id() OR app.is_member(workspace_id));
--> statement-breakpoint
-- Owners add members. The billing-account owner may add the first membership of a new workspace.
CREATE POLICY memberships_insert ON memberships FOR INSERT TO destra_app
  WITH CHECK (app.is_owner(workspace_id) OR app.owns_workspace_billing(workspace_id));
--> statement-breakpoint
CREATE POLICY memberships_update ON memberships FOR UPDATE TO destra_app
  USING (app.is_owner(workspace_id)) WITH CHECK (app.is_owner(workspace_id));
--> statement-breakpoint
CREATE POLICY memberships_delete ON memberships FOR DELETE TO destra_app
  USING (app.is_owner(workspace_id));
--> statement-breakpoint

-- ---------- Workspace-scoped tables: rows visible only inside their workspace context ----------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'professional_profiles', 'brand_settings', 'connected_accounts', 'workspace_references',
    'interest_tags', 'owned_post_insights', 'workspace_style_targets', 'discovery_feed_items',
    'content_items', 'generation_runs', 'content_variants', 'compliance_runs', 'compliance_checks',
    'compliance_overrides', 'approvals', 'publications', 'consent_records', 'usage_ledger'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO destra_app
         USING (workspace_id = app.current_workspace_id())
         WITH CHECK (workspace_id = app.current_workspace_id())',
      t || '_tenant_isolation', t
    );
  END LOOP;
END
$$;
--> statement-breakpoint

-- ---------- Audit log: append-only and hash-chained per workspace ----------
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_log_select ON audit_log FOR SELECT TO destra_app
  USING (workspace_id = app.current_workspace_id());
--> statement-breakpoint
-- System events (no workspace) may be written from any context.
CREATE POLICY audit_log_insert ON audit_log FOR INSERT TO destra_app
  WITH CHECK (workspace_id IS NULL OR workspace_id = app.current_workspace_id());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.audit_log_chain() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  previous text;
BEGIN
  -- Serialize writers per chain so two concurrent inserts can't share a prev_hash.
  PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(NEW.workspace_id::text, 'system'), 0));
  SELECT a.hash INTO previous FROM audit_log a
   WHERE a.workspace_id IS NOT DISTINCT FROM NEW.workspace_id
   ORDER BY a.id DESC LIMIT 1;
  NEW.prev_hash := previous;
  NEW.hash := encode(sha256(convert_to(concat_ws('|',
    coalesce(previous, ''), coalesce(NEW.workspace_id::text, ''), NEW.actor, NEW.action,
    NEW.entity, coalesce(NEW.entity_id, ''), NEW.payload::text,
    to_char(NEW.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  ), 'UTF8')), 'hex');
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_chain BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION app.audit_log_chain();
--> statement-breakpoint
-- Belt and braces: even the owner can't rewrite history without dropping this trigger.
CREATE OR REPLACE FUNCTION app.audit_log_immutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION app.audit_log_immutable();
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO destra_app;
