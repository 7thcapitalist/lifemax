# Tech context

## Stack

Next.js 15.5 (App Router), React 19.1, TypeScript, Drizzle ORM over
better-sqlite3 (a local SQLite file, path from the `DATABASE_PATH` env var),
argon2 for password hashing (`@node-rs/argon2`), Zod for validation. Package
manager is pnpm (pinned via `packageManager`), Node engine pinned to `22.x`.
Tests: Vitest across three projects (unit, integration, architecture) plus
Playwright for e2e/screenshot journeys with `@axe-core/playwright`
accessibility checks. Lint/format: ESLint + Prettier. `pnpm verify` runs the
full gate: format check, lint, typecheck, all three Vitest projects, and a
production build.

## Environments

Local only right now — there is no staging or production deployment.
`HOST`/`PORT`/`APP_ORIGIN` are env-driven (see `.env.example`), and the SQLite
database is a single file on disk. Real work happens in git worktrees off
task branches (e.g. `task/d0-foundation`, `task/d1-playable`) rather than
directly on `main`.

## Constraints

- `AI_MODE` and telemetry (`NEXT_TELEMETRY_DISABLED`) default to disabled.
  This is a product/privacy commitment (see VISION.md), not an oversight —
  do not flip either default without a founder decision.
- `SETUP_MODE` gates onboarding; check its current value before assuming
  onboarding is reachable in a given environment.
- Single-owner system: there is currently no multi-tenant design intent.

## Do not do

- Do not enable AI calls or telemetry by default.
- Do not add external integrations (calendar, health, finance, GitHub
  evidence) without an explicit decision — see ROADMAP.md "Later".
- Do not assume an agent's shell can run installs, `pnpm verify`, or `git
  commit` directly in every worktree — see MEMORY.md for a real instance of
  this being blocked.

## Observability

No production logs/metrics exist yet since nothing is deployed. The test
suite (`pnpm verify`) is the current source of truth for "did this change
break something."
