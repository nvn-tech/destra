# Destra

AI content platform for regulated professionals in Brazil, starting with doctors. Destra learns a professional's voice and what works on social media, drafts posts, checks them against council advertising rules (CFM, ANVISA), and publishes only what the professional approves.

**New here? Read [`docs/HANDOFF.md`](docs/HANDOFF.md).** It covers the current state, architecture, invariants, how to run everything and the next steps.

## Layout

| Path              | What                                                                         |
| ----------------- | ---------------------------------------------------------------------------- |
| `apps/panel`      | Next.js panel and landing page (PT-BR)                                       |
| `apps/api`        | Fastify API, Better Auth, Meta callbacks                                     |
| `apps/worker`     | Temporal workflows: Instagram import, reference sync, publishing             |
| `packages/db`     | Drizzle schema, migrations, RLS, tenant-aware client, token vault, seed data |
| `packages/meta`   | Meta Graph API client, OAuth helpers, `FakeGraph` for tests                  |
| `packages/media`  | Slide renderer (1080×1350 PNG) and media storage (S3 or local)               |
| `packages/shared` | Domain constants, env loading, the mandatory identification line             |
| `docs/adr`        | Architecture decisions (0001–0006)                                           |
| `docs/product`    | Design doc, legal and platform research, Stitch design brief                 |
| `scripts`         | Local DB roles, fake Meta server, manual import and publish runners          |

## Getting started

Requires Node 22, pnpm 10 and Postgres 16 with pgvector (Docker Compose provides it, plus Temporal).

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

The panel runs on http://localhost:3000, the API on http://localhost:4000 and the Temporal UI on http://localhost:8233. To try Instagram flows without a real Meta app, see "Local Meta without a real app" in the handoff doc.

## Checks

```bash
pnpm lint && pnpm build && pnpm typecheck
```

```bash
pnpm test
```

Set `SKIP_TEMPORAL_TESTS=1` where Temporal's test server can't be downloaded. Each package creates its own test database. CI also fails if migrations and the schema diverge (`pnpm db:generate`).
