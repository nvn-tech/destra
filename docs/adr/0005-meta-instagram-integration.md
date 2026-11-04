# 0005 — Instagram through Meta's Graph API (Facebook Login)

**Status:** accepted · 2026-11-04

## Decision

- Use the **Instagram API with Facebook Login**. Business Discovery (reading other professional accounts) and hashtag search only exist on this path, so the doctor's Instagram professional account must be linked to a Facebook Page they manage.
- No scraping vendors. Reference profiles come only from Business Discovery, so personal accounts can't be references.
- Flow: panel → `POST /connections/instagram/start` → Facebook Login → `GET /v1/integrations/meta/callback`.
  - The callback checks the signed `state` against the signed-in user and swaps the code for a long-lived user token (about 60 days).
  - It then checks the granted permissions and lists the doctor's Pages.
  - One Instagram account: connected directly. Several: the doctor picks one, and the pending choice expires after 15 minutes.
- Tokens: page and user tokens are encrypted with AES-256-GCM (`packages/db/src/vault.ts`) before they reach Postgres. They're stored in the RLS-protected `secrets` table and deleted on disconnect, deauthorization and data deletion. Every server call carries `appsecret_proof`.
- Ingestion runs in Temporal workflows:
  - `backfillOwnAccountWorkflow` imports the last 100 own posts, metric snapshots and private insights for the 30 most recent.
  - `syncReferenceAccountWorkflow` imports 30 posts of a reference through Business Discovery, one run per corpus account at a time.
  - Revoked tokens mark the connection `expired` and stop retrying. Rate limits retry with backoff.
- Callbacks Meta requires for App Review: `POST /v1/integrations/meta/deauthorize`, `POST /v1/integrations/meta/data-deletion` (returns a status URL and confirmation code), and `GET /v1/integrations/meta/data-deletion/:code`.

## Verification status

Tested only against `FakeGraph` (`packages/meta/src/testing/fake-graph.ts`), which follows Meta's documented shapes. Before launch, test with a real Meta app in development mode:

- Exact insight metric names per media type.
- Business Discovery errors for personal accounts.
- Rate-limit headers.
- Page tasks needed to publish.

## Local development

`node scripts/fake-meta.mjs` serves a fake Graph API and login dialog on port 4100. Point `META_GRAPH_URL` and `META_DIALOG_URL` there. Without Temporal, `node scripts/run-ingest.mjs` runs the import once (see the script header for its environment).
