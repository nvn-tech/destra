# Destra — instructions for coding agents

Start with `docs/HANDOFF.md`. It has the current state, architecture, invariants, how to run everything and the next steps. Product context is in `docs/product/`, and decisions are in `docs/adr/`.

## Before you push

```bash
pnpm lint && pnpm build && pnpm typecheck && SKIP_TEMPORAL_TESTS=1 pnpm test
```
`pnpm --filter @destra/db generate` must report no schema changes.

## Non-negotiable rules (details in HANDOFF §4)

- Every table with `workspace_id` gets forced RLS plus a tenant-isolation policy in a migration. A test enforces it.
- Runtime code uses the app role (`DATABASE_APP_URL`), never the owner. Check membership with `guards.requireWorkspace()` before `withTenant()`.
- No post is published without the doctor's per-post approval and attestation. No batch approval, no auto-publish by default.
- The CRM/RQE identification comes only from `signatureLine()` in `@destra/shared`, never from AI output.
- The kill switch is checked at publish time. The publisher must never double-post.
- Platform tokens are encrypted with the vault and never logged or returned.
- The audit log is append-only.
- Official APIs only: no scraping vendors.
- Honest copy: no compliance guarantees, fake certifications, fake testimonials or partner claims.
- The UI is in Brazilian Portuguese. Code, comments and docs are in English.

## Environment notes (Claude Code cloud sandbox)

- Start Postgres with `pg_ctlcluster 16 main start`. Docker and `temporal.download` aren't available, so use `SKIP_TEMPORAL_TESTS=1`.
- Use `scripts/fake-meta.mjs` plus `scripts/run-ingest.mjs` / `scripts/run-publish.mjs` to exercise Meta flows locally.
- `gh pr create` doesn't work; open PRs with `gh api repos/nvn-tech/destra/pulls`.
- Edit Biome-formatted files with exact-match edits; always re-check that a replacement actually applied.
