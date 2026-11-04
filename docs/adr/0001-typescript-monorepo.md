# 0001 — TypeScript monorepo

**Status:** accepted · 2026-11-04

## Decision

One pnpm + Turborepo monorepo, all TypeScript:

| Path              | What                                                          |
| ----------------- | ------------------------------------------------------------- |
| `apps/panel`      | Next.js operational panel (PT-BR UI)                          |
| `apps/api`        | Fastify HTTP API, Better Auth                                 |
| `apps/worker`     | Temporal worker (ingestion, generation, publishing workflows) |
| `packages/db`     | Drizzle schema, migrations, tenant-aware client               |
| `packages/shared` | Domain constants, env loading                                 |

## Why

- One language for the whole team; shared types between panel, API and workers.
- The AI parts are LLM API calls, which have first-class TypeScript SDKs. Heavier ML (self-hosted Whisper, custom models) can run as separate services later if needed.

## Consequences

- Biome for lint and format; Vitest for tests.
- Packages build to `dist/` and are consumed through `exports`; Turbo builds dependencies first.
