-- Kill switch: owners and editors can pause or resume publishing for a workspace.
-- A narrow SECURITY DEFINER function changes only this column, so the general
-- workspaces UPDATE policy can stay owner-only.
CREATE OR REPLACE FUNCTION app.set_publishing_paused(ws uuid, paused boolean) RETURNS timestamptz
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  result timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.workspace_id = ws AND m.user_id = app.current_user_id() AND m.role IN ('owner', 'editor')
  ) THEN
    RAISE EXCEPTION 'not allowed to change publishing for this workspace' USING ERRCODE = '42501';
  END IF;
  UPDATE workspaces SET publishing_paused_at = CASE WHEN paused THEN now() ELSE NULL END
   WHERE id = ws RETURNING publishing_paused_at INTO result;
  RETURN result;
END
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.set_publishing_paused(uuid, boolean) TO destra_app;
