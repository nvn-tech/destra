# 0004 — Temporal for long-running workflows

**Status:** accepted · 2026-11-04

## Decision

Long, retry-heavy work (onboarding backfill, ingestion, generation with human approval, scheduled publishing) runs as Temporal workflows in `apps/worker`. Activities receive their dependencies (database, clients) through `createActivities()` so they can be tested directly.

## Why

Approval can take days, publishing must happen at an exact time and never twice, and platform APIs fail often. Temporal gives durable timers, retries and idempotent execution without a hand-built job system.

## Consequences

- Local: `docker compose up temporal` (CLI dev server). Production: Temporal Cloud.
- The end-to-end workflow test downloads Temporal's dev server; set `SKIP_TEMPORAL_TESTS=1` where that isn't possible. CI always runs it.
