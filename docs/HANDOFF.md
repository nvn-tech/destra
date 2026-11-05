# Destra — handoff for the next agent

Last updated: 2026-11-05. Read this first, then `CLAUDE.md` (working rules) and the ADRs in `docs/adr/`.

## 1. What Destra is

Destra is a Brazil-first, multi-tenant SaaS for regulated professionals, starting with doctors (endocrinology). The doctor connects Instagram and picks reference profiles. The product then:

1. learns the doctor's voice and what works for their audience;
2. drafts posts (carousels, captions, reel scripts) in that voice;
3. checks every draft against medical-advertising rules (CFM, ANVISA);
4. publishes only what the doctor approves.

The doctor remains legally responsible for every post (CFM Res. 2.454/2026). The product is designed around that: approval of every post, an explicit attestation, an audit log, and a kill switch.

Product background lives in `docs/product/`:

| File                             | What                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `design-doc.md`                  | Full design: architecture, data model, compliance engine, pipelines, generation engine, roadmap                                    |
| `legal-and-platform-research.md` | Legal and compliance findings (CFM, ANVISA, LGPD, scraping) and per-platform API feasibility. Many facts are flagged **[VERIFY]**. |
| `stitch-design-brief.md`         | UI brief used with Google Stitch. The Stitch output was used as a guideline only, not as the source of truth.                      |

All UI text is **Brazilian Portuguese**. Code, comments and docs are English.

## 2. Current state (what works)

| Area                                                                                           | Status                                                   | Where                                                                                  |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Monorepo, CI                                                                                   | Done                                                     | root, `.github/workflows/ci.yml`                                                       |
| Database: corpus + tenant zone with forced RLS, audit log                                      | Done                                                     | `packages/db`                                                                          |
| Auth (Better Auth, email/password, Google optional)                                            | Done                                                     | `apps/api/src/auth.ts`                                                                 |
| Workspaces, roles, professional profile (CRM/UF/RQE)                                           | Done                                                     | `apps/api/src/routes/workspaces.ts`                                                    |
| Review queue: variants, compliance checks, approve with attestation, reject                    | Done (API + panel)                                       | `routes/review.ts`, `apps/panel/app/w/[workspaceId]/revisao`                           |
| Kill switch (pause all publishing)                                                             | Done                                                     | `PUT /publishing`, top bar in panel                                                    |
| Instagram connection (Facebook Login), encrypted tokens, Meta callbacks                        | Done, **tested only against a fake Graph API**           | `routes/instagram.ts`, `packages/meta`                                                 |
| Import of own posts and insights; reference profiles via Business Discovery                    | Done, fake-tested                                        | `apps/worker/src/activities/instagram.ts`, `routes/references.ts`                      |
| Publishing: slide rendering, media storage, schedule, publish workflow that never double-posts | Done, fake-tested                                        | `packages/media`, `apps/worker/src/activities/publishing.ts`, `routes/publications.ts` |
| Landing page (honest claims, legal-entity placeholders)                                        | Done                                                     | `apps/panel/app/page.tsx`                                                              |
| **Generation engine** (style profiles, AI drafts)                                              | **Not started.** The queue is filled by dev seed data.   | —                                                                                      |
| **Compliance engine** (real rule evaluation, LLM judges)                                       | **Not started.** Checks are seeded as a draft rule pack. | `packages/db/src/seed.ts`                                                              |
| Calendar, inspiration, voice, results, rules screens                                           | Not started ("Em breve" in the sidebar)                  | —                                                                                      |
| Billing, onboarding steps 2–5, invitations                                                     | Not started                                              | —                                                                                      |

### History

All work is on `main`. There are no open PRs or feature branches.

| PR | Content |
| --- | --- |
| nvn-tech/destra#1 | Monorepo, DB/RLS, auth, worker, CI |
| nvn-tech/destra#2 | Design system, review queue, profile, landing page |
| nvn-tech/destra#3 | Instagram integration. It was merged into an already-merged stacked branch, so it reached `main` through #4. |
| nvn-tech/destra#4 | Instagram integration + publishing + handoff docs |

Work in short branches off `main`, one PR each. If you must stack PRs, retarget each PR to `main` before merging it (`gh api -X PATCH repos/nvn-tech/destra/pulls/<n> -f base=main`). Never merge a PR into a branch that's already merged. `gh pr create` is unavailable in Claude Code cloud sessions; use `gh api repos/nvn-tech/destra/pulls` (REST) instead.

## 3. Architecture

```text
apps/panel (Next.js 16, PT-BR) ──HTTP+cookie──► apps/api (Fastify 5, Better Auth)
                                                    │  starts workflows (JobQueue)
                                                    ▼
                                   Temporal ──► apps/worker (activities)
                                                    │
     packages/db (Drizzle + Postgres/pgvector, RLS) ◄┤
     packages/meta (Graph API client, OAuth, FakeGraph)
     packages/media (slide renderer satori+resvg, S3/local store)
     packages/shared (env loader, domain constants, signatureLine)
```

| Package           | Responsibility                                                                        | Key files                                                            |
| ----------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `packages/shared` | Domain constants, `loadEnv`, `signatureLine()` (the mandatory CRM/RQE line)           | `src/identification.ts`                                              |
| `packages/db`     | Schema, migrations, `withTenant()`, vault, seed, test helpers                         | `src/schema/*`, `drizzle/*.sql`, `src/client.ts`, `src/vault.ts`     |
| `packages/meta`   | `GraphClient`, OAuth state, signed_request, caption/publish-plan helpers, `FakeGraph` | `src/client.ts`, `src/mapping.ts`, `src/testing/fake-graph.ts`       |
| `packages/media`  | `renderSlides()` (1080×1350 PNG), `S3MediaStore`, `LocalMediaStore`                   | `src/render.ts`, `src/store.ts`                                      |
| `apps/api`        | HTTP API, auth, guards, routes, job queue                                             | `src/app.ts`, `src/routes/*`, `src/plugins/tenant.ts`, `src/jobs.ts` |
| `apps/worker`     | Temporal workflows and activities                                                     | `src/workflows/index.ts`, `src/activities/*`                         |
| `apps/panel`      | Next.js panel and landing page                                                        | `app/*`, `components/*`, `lib/*`                                     |

### Data model in one paragraph

- **Global corpus** (no RLS, shared by all tenants): `source_accounts`, `posts`, snapshots, features, embeddings, performance, style profiles.
- **Tenant zone** (every table with `workspace_id`, RLS forced): workspaces, memberships, profiles, connections, secrets, references, content items/variants, compliance runs/checks, approvals, publications, usage ledger, audit log.
- **Platform config** (read-only for the app): verticals, topics, compliance rules.
- `posts.is_owned_by_tenant` marks a doctor's own posts. Private metrics live in the tenant table `owned_post_insights`.

### API routes

- Auth: `/api/auth/*` (Better Auth).
- Health: `GET /health`.
- Workspaces: `GET|POST /v1/workspaces`, `GET /v1/workspaces/:id`, `PUT .../professional-profile`, `PUT .../publishing` (kill switch).
- Review: `GET .../review-queue`, `POST .../variants/:id/approve` (`{attestation: true, scheduledAt?}`), `POST .../content-items/:id/reject`.
- Instagram: `GET .../connections`, `POST .../connections/instagram/start`, `GET|POST .../connections/instagram/grants/:grantId[/complete]`, `DELETE .../connections/:id`.
- Meta callbacks: `GET /v1/integrations/meta/callback`, `POST /v1/integrations/meta/deauthorize`, `POST /v1/integrations/meta/data-deletion`, `GET /v1/integrations/meta/data-deletion/:code`.
- References: `GET|POST .../references`, `PATCH|DELETE .../references/:sourceAccountId`.
- Publications: `GET .../publications`, `PATCH|DELETE .../publications/:id`.
- Dev media: `GET /v1/media/*` (signed, only when `MEDIA_LOCAL_DIR` is set).

### Workflows (worker)

| Workflow                       | ID                                 | What                                                                                     |
| ------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `systemCheckWorkflow`          | any                                | Smoke test                                                                               |
| `backfillOwnAccountWorkflow`   | `backfill-own-<connectionId>`      | Last 100 own posts, metrics, insights for 30 most recent                                 |
| `syncReferenceAccountWorkflow` | `sync-reference-<sourceAccountId>` | 30 reference posts via Business Discovery                                                |
| `publishWorkflow`              | `publish-<publicationId>`          | Sleeps until due (max 6h per sleep), re-reads state, respects the kill switch, publishes |

All are started from the API with `workflowIdConflictPolicy: "USE_EXISTING"`.

## 4. Invariants — do not break these

These are the product's legal and safety guarantees. Each has tests; keep it that way.

1. **Every table with `workspace_id` has forced RLS.** The guard test in `packages/db/src/rls.test.ts` fails otherwise. A new tenant table needs a migration with `ENABLE` + `FORCE ROW LEVEL SECURITY` and a tenant-isolation policy (see `0006_meta_connections_security.sql`).
2. **The app never connects as the DB owner.** Runtime uses `DATABASE_APP_URL` (role `destra_api`, member of `destra_app`). Migrations use `DATABASE_URL`.
3. **Membership is checked before a workspace context is set.** Use `guards.requireWorkspace()` and then `withTenant(db, access, fn)`. Never call `withTenant` with a workspace id from user input that hasn't passed the guard.
4. **No publication without the doctor's approval.** Approval needs `attestation: true`. There is **no batch approval and no auto-publish**. Blocked variants and workspaces without a professional profile can't be approved.
5. **The CRM/RQE identification is injected by code**, through `signatureLine()` in `@destra/shared`, in the preview, on every slide and in the caption. Never let the AI write it. `packages/media` has a test that the signature stays inside the canvas.
6. **The kill switch is checked at publish time.** Pausing must stop everything still pending.
7. **Never double-post.** Container IDs are saved before `media_publish`. A retry that finds the container `PUBLISHED` reconciles by caption instead of publishing again.
8. **Tokens are encrypted** (`vault.ts`, AES-256-GCM) and deleted on disconnect, deauthorization and data deletion. Never log or return them.
9. **The audit log is append-only.** Write meaningful actions to `audit_log`; never update or delete it (a trigger blocks it).
10. **No scraping vendors.** Read other accounts only through official APIs (Business Discovery). See the research doc for why.
11. **Honest copy.** No guarantees ("blindado", "100% conforme", "risco 0"), no certifications we don't hold, no fake testimonials or numbers, no "Meta partner" claims. Rule citations come from rule data, not hard-coded UI text.
12. **Compliance status is always an icon plus a word**, never color alone.

## 5. Running it

Requirements: Node 22, pnpm 10, Postgres 16 with pgvector (or Docker), optionally Temporal.

```bash
pnpm install
```

```bash
docker compose up -d
```

```bash
cp .env.example .env
```

```bash
DATABASE_URL=postgres://destra:destra@localhost:5432/destra pnpm db:migrate
```

```bash
pnpm build && pnpm dev
```

The panel runs on :3000, the API on :4000 and the Temporal UI on :8233.

### Without Docker (as in the Claude Code cloud sandbox)

- Postgres: `pg_ctlcluster 16 main start` (after a container restart you may see "Removed stale pid file"; that's fine). pgvector comes from `apt-get install postgresql-16-pgvector`. Run `psql -f scripts/setup-local-db.sql` as the `postgres` superuser to create the roles.
- Docker can't run containers in the sandbox, and `temporal.download` is blocked, so the Temporal end-to-end test is skipped there with `SKIP_TEMPORAL_TESTS=1`. CI runs it.

### Local Meta without a real app

1. `node scripts/fake-meta.mjs` serves a fake Graph API and login dialog on `http://127.0.0.1:4100` (demo user `@dra.anasouza`, discoverable `@dra.referencia`).
2. Start the API with `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_URL` and `META_DIALOG_URL` pointing at 4100, plus `TOKEN_ENCRYPTION_KEY`, `MEDIA_LOCAL_DIR` and `MEDIA_SIGNING_SECRET`.
3. Without Temporal, run the background work by hand. The scripts read the same env as the worker (see their headers):
   - `node scripts/run-ingest.mjs` imports posts.
   - `node scripts/run-publish.mjs` publishes due posts.
4. Fill a review queue with demo content: `DATABASE_URL=<owner url> pnpm --filter @destra/db seed:dev <workspaceId>`.

### Checks (all must pass before pushing)

```bash
pnpm lint && pnpm build && pnpm typecheck
```

```bash
SKIP_TEMPORAL_TESTS=1 pnpm test
```

```bash
pnpm --filter @destra/db generate
```

The last command must report "No schema changes"; CI fails if the schema and migrations diverge.

Each package's tests create their own database (`destra_test_db`, `destra_test_api`, `destra_test_worker`) through `recreateTestDatabase()`, so suites run in parallel.

## 6. Not verified yet (important)

- **Nothing has talked to the real Meta API.** Everything was tested against `FakeGraph`, which follows Meta's docs. With a real app in development mode (testers), confirm:
  - The OAuth flow and permission names.
  - Insight metric names per media type.
  - Business Discovery errors for personal accounts.
  - Container processing and image URL fetching from presigned S3.
  - The `content_publishing_limit` fields.
  - Page tasks needed to publish.

  See ADRs 0005 and 0006.
- **The compliance rule pack is a draft** (`packages/db/src/seed.ts`, `medicina-br@draft-1`) and has not been reviewed by a health-law specialist. Council rule wording in `docs/product/legal-and-platform-research.md` comes from secondary sources (**[VERIFY]**).
- **Docker Compose** has never been run (no Docker daemon in the sandbox). Its Temporal image is `latest`; pin it.
- **The landing page** has placeholders that must be replaced before going public: `[Razão social]`, `[CNPJ]` and `[Cidade/UF]`. Plan prices (R$197/R$497) are unconfirmed.
- The `S3MediaStore` has no integration test against real S3 or MinIO.

## 7. Suggested next steps (in order)

1. **Real Meta app in development mode:** connect a real account and fix whatever differs from `FakeGraph`. Then prepare App Review: a screencast, the privacy policy URL, and the deauthorize and data-deletion URLs from section 3.
2. **Compliance engine (design doc §4):** deterministic checks (required fields, lexicons, patterns), claim extraction, LLM judges with rubrics, a fix loop, and a golden-set evaluation in CI. Replace the seeded checks with real `compliance_runs`. The rule pack needs legal sign-off.
3. **Generation engine (design doc §6):**
   - Enrichment features and embeddings for imported posts.
   - Account and workspace style profiles.
   - A style card.
   - Angles → drafts → polish, 3 variants, and originality checks.

   This fills the review queue for real, replacing `seedDemoReviewQueue`. Use the latest Claude models via the Anthropic SDK, and record cost in `usage_ledger`.
4. **Editing in the review screen:** apply suggestions, edit text, re-run compliance. The API needs a variant-update endpoint that resets `complianceStatus` to `pending`.
5. **Onboarding steps 2–5** (connect, interests and references, voice sample, first drafts) and the remaining screens (calendar, results, rules/audit), following `stitch-design-brief.md` and the review in this repo's history.
6. **Operations:**
   - Token-health job (refresh and warn before expiry).
   - LGPD retention job (`posts.raw_expires_at`, `post_media.expires_at`).
   - Crawl scheduler by `crawl_tier`.
   - Billing (Asaas/Pagar.me, Pix, NFS-e).

## 8. Gotchas we hit

- **Drizzle wraps Postgres errors** ("Failed query: …"), so the real message is in `error.cause`. Use `expectDbError()` in `packages/db/src/test/fixtures.ts`.
- **Raw-SQL `bigint` values come back as strings** from `pg`. Cast in SQL (`::integer`) when the panel expects numbers (follower counts).
- **Don't send `content-type: application/json` without a body.** Fastify rejects it. The panel's `api()` helper only sets it when there's a body.
- **Turbo strips undeclared env vars.** Declare test env vars in `turbo.json` (`TEST_DATABASE_HOST`, `SKIP_TEMPORAL_TESTS`).
- **satori puts padding outside width/height** unless `boxSizing: "border-box"`. That once cropped the CRM/RQE footer off every slide; a regression test now covers it.
- **Temporal activities are called unbound.** Never use `this` inside an activity object.
- **TypeScript allows a function with fewer parameters** where one with more is expected. A stale `approve()` that ignored the schedule argument passed typecheck. Test the UI flows end to end with Playwright (Chromium is preinstalled in the sandbox).
- **When editing files Biome has reformatted, use exact-match edits** (the Edit tool), not regex or string-replace scripts. Several silent no-op replacements happened that way.
- **`pkill -f "next start"` doesn't stop the server.** The process is named `next-server`.

## 9. Conventions

- **TypeScript strict, ESM, Biome** (`pnpm lint`; `pnpm format` to fix). No ESLint or Prettier.
- **Validation:** Zod at every API boundary. Errors go through `HttpError(status, message)` with PT-BR messages for the user.
- **DB access:** `withTenant(db, { userId, workspaceId? }, tx => …)`. System actors use `userId: "system:worker"`, `"system:publisher"` or `"system:meta"`.
- **Schema changes:** edit `packages/db/src/schema`, then `pnpm db:generate`. Hand-written SQL (RLS, functions, grants) goes in a `--custom` migration.
- **Tests:** Vitest. Each suite owns its database. Meta behaviour is tested with `FakeGraph`. Every new invariant gets a test.
- **Commits:** imperative subject, body explaining why. Never commit secrets (`.env` is gitignored).
