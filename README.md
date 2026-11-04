# Destra

AI content platform for regulated professionals in Brazil, starting with doctors. Destra learns a professional's voice and what works on social media, drafts posts, checks them against council rules (CFM) and publishes them.

## Layout

| Path              | What                                                 |
| ----------------- | ---------------------------------------------------- |
| `apps/panel`      | Next.js panel (PT-BR)                                |
| `apps/api`        | Fastify API + Better Auth                            |
| `apps/worker`     | Temporal worker                                      |
| `packages/db`     | Drizzle schema, migrations, RLS, tenant-aware client |
| `packages/shared` | Domain constants, env loading                        |
| `docs/adr`        | Architecture decisions                               |

## Getting started

Requires Node 22, pnpm 10 and Docker.

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

The panel runs on http://localhost:3000, the API on http://localhost:4000 and the Temporal UI on http://localhost:8233.

## Tests

Tests need Postgres with pgvector and the roles from `scripts/setup-local-db.sql` (Docker Compose creates them). Each package creates its own test database.

```bash
pnpm test
```

## Database rules

- Every table with a `workspace_id` gets forced row-level security; a test enforces this.
- The app connects as `destra_api` (member of `destra_app`), never as the owner.
- Change the schema in `packages/db/src/schema`, then run `pnpm db:generate`. CI fails if they diverge.

See `docs/adr/0002-postgres-tenancy-rls.md` for details.
