# 0002 — Postgres with row-level security for tenancy

**Status:** accepted · 2026-11-04

## Decision

- One Postgres database (pgvector for embeddings), two zones:
  - **Global corpus** (`source_accounts`, `posts`, features, embeddings…): shared by all tenants, no RLS.
  - **Tenant zone** (every table with `workspace_id`): RLS enabled and **forced**.
- The running app connects as a login role that is a member of `destra_app` (no superuser, no `BYPASSRLS`). Migrations run as the owner.
- `withTenant(db, { userId, workspaceId }, fn)` runs `fn` in a transaction with `app.user_id` and `app.workspace_id` set via `set_config(..., true)`, so the context never leaks across pooled connections.
- The API checks membership **before** setting `workspaceId`; RLS is the second line of defence against a forgotten `where` clause.
- Policies that need membership data call `SECURITY DEFINER` helpers in schema `app` to avoid recursive policies.
- `audit_log` is append-only (no `UPDATE`/`DELETE` grant, plus a trigger that blocks even the owner) and hash-chained per workspace.
- Platform config (verticals, rules) is read-only for the app; it changes through migrations.

## Rules for new tables

1. A tenant table must have `workspace_id` and be added to the RLS loop in a migration. A test fails if any `workspace_id` table lacks forced RLS.
2. Schema changes go through `pnpm db:generate`; CI fails if migrations and schema diverge.

## Deferred

Partitioning of `post_metric_snapshots` and `audit_log` by month (when volume justifies it).
