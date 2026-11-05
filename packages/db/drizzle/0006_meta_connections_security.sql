-- New tenant tables get the same isolation as the rest of the tenant zone.
ALTER TABLE secrets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE secrets FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY secrets_tenant_isolation ON secrets FOR ALL TO destra_app
  USING (workspace_id = app.current_workspace_id())
  WITH CHECK (workspace_id = app.current_workspace_id());
--> statement-breakpoint
ALTER TABLE meta_oauth_grants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE meta_oauth_grants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY meta_oauth_grants_tenant_isolation ON meta_oauth_grants FOR ALL TO destra_app
  USING (workspace_id = app.current_workspace_id())
  WITH CHECK (workspace_id = app.current_workspace_id());
--> statement-breakpoint
-- Meta's deauthorization and data-deletion callbacks arrive with only the app-scoped
-- user id. This returns which workspaces hold connections for that user, so each can
-- then be handled inside its own tenant context.
CREATE OR REPLACE FUNCTION app.meta_connections_for_user(meta_user_id text)
  RETURNS TABLE (workspace_id uuid, connected_account_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.workspace_id, c.id FROM connected_accounts c
   WHERE c.external_user_id = meta_user_id AND c.platform IN ('instagram', 'facebook')
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.meta_connections_for_user(text) TO destra_app;
