# 0003 — Better Auth for authentication

**Status:** accepted · 2026-11-04

## Decision

Use [Better Auth](https://www.better-auth.com) inside the API (`/api/auth/*`), storing users and sessions in our Postgres (`auth_*` tables). Email + password now; Google sign-in when `GOOGLE_CLIENT_ID`/`SECRET` are set.

## Why

- Self-hosted and open source: user data stays in our database and region (LGPD), no per-user vendor fees.
- TypeScript-native, Drizzle adapter, cookie sessions that work for panel and API on the same site.

## Consequences

- Panel and API must share a site in production (e.g., `app.destra.com.br` and `api.destra.com.br`) for cookies.
- Social login for Instagram/Facebook connections is separate from sign-in: platform OAuth tokens live in the vault and are referenced by `connected_accounts.token_ref`.
