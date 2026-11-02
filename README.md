# Lifemaxing

A private, single-owner web app that turns a person's real-life goals into an RPG-style morning ritual: a character sheet, weekly quests and a daily briefing, without collapsing a person into one score.

## Why

Most productivity apps either track everything or guilt you with streaks. The idea here is different: you define the kind of person you want to become, split it into domains (Builder, Body, Knowledge, Academics, Capital, Relationships, Life Lived, Recovery are the defaults), and play quests against those domains. Rest and adventure count as progress, and the app is meant to flag when chasing one stat hurts the others. See [docs/PRODUCT.md](docs/PRODUCT.md) and [docs/DESIGN_LANGUAGE.md](docs/DESIGN_LANGUAGE.md).

## Status

Built, not yet used daily. The playable slice (called D1) works end to end on a real backend; I have not yet run the 7-day personal-use experiment that decides whether it is worth building further.

Works today: owner setup, character onboarding, a deterministic daily briefing, quest accept / edit / swap / decline / resolve, and the Today, Character, Chronicle, Momentum and Program screens. Unit, component, integration, architecture and Playwright tests exist, with committed responsive screenshots in `docs/qa/screenshots/`.

Deliberately not built: any external AI (it is hard-disabled by `AI_MODE=disabled`), XP and levels, weekly review, Fitbit or other integrations, telemetry, notifications. All test data is synthetic.

## How it works

A single-process modular monolith. Dependencies point one way, `app -> application -> domain`, with infrastructure adapters behind ports; a test enforces the boundary.

- Next.js route handlers call application services, which call pure domain policy (`src/domain/`).
- SQLite (better-sqlite3) locally; remote libSQL on Vercel. Drizzle, ordered transactional SQL migrations with checksums, and append-only triggers on progress records.
- Auth is Argon2id password hashing, rotating session tokens with a short grace window for in-flight requests, Origin/CSRF checks and source-scoped login throttling. Every personal row carries `owner_id`.
- Privacy is part of the design: see [docs/privacy-contract.md](docs/privacy-contract.md) and [docs/architecture.md](docs/architecture.md).

## Stack

Next.js 15, React 19, TypeScript, Drizzle, SQLite / libSQL, Zod, Vitest, Playwright with axe, pnpm 10, Node 22.

## What's next

1. Use it for 7 consecutive real days and record what is useful versus performative.
2. Add a lightweight weekly review.
3. Define XP rules that resist gaming (still an open question).
4. Only then consider a basic AI game master, calendar or GitHub evidence, and outside testers. See [context/ROADMAP.md](context/ROADMAP.md).

## Run it

### Requirements

- Node.js 22.19.0 (see `.node-version`)
- Corepack with pnpm 10.15.1

## Local setup

```sh
cp .env.example .env.local
corepack pnpm install --frozen-lockfile
corepack pnpm db:migrate
corepack pnpm dev
```

Owner setup is closed by default. For the first run only, keep the server bound directly to loopback, set `SETUP_MODE=local`, create the owner through `/setup`, then stop it and return `SETUP_MODE=disabled` before normal use. The route additionally requires an exact configured Origin and localhost request host, and the database closes setup permanently after one owner. Do not expose this provisioning window through a proxy or tunnel.

The password is submitted only in the request body over localhost/TLS and stored only as an Argon2id hash. Never put passwords in arguments, environment files, fixtures, or logs.

For a production-mode local run, build first and use `./run.sh`. Data defaults to the ignored `./data` directory with directory mode 0700.

Vercel deployments use durable remote libSQL storage and operator-only owner provisioning. See the [Vercel deployment runbook](docs/deployment/vercel.md) for the fail-closed environment contract, migration lifecycle, provisioning, and production smoke test.

## Backup and restore verification

Create every backup at a new explicit target; the command refuses overwrite, the source path, and symlink-parent targets. Backup files are forced to mode 0600 even inside an existing permissive directory.

```sh
corepack pnpm backup -- /private/path/lifemaxing-backup.sqlite
corepack pnpm restore:check -- /private/path/lifemaxing-backup.sqlite
```

`restore:check` opens the candidate read-only, runs SQLite `integrity_check`, and requires the exact expected migration names and SHA-256 checksums in non-mutating mode. Migration history is fail-closed: an edited migration or an already-applied legacy migration without a recorded checksum must be recovered from a verified backup or recreated; it is never silently stamped. Keep the source and backup on encrypted storage with restricted parent-directory access.

## Checks

```sh
corepack pnpm verify
corepack pnpm test:e2e
corepack pnpm test:e2e:screenshots
```

`verify` runs format, lint, typecheck, unit/integration/architecture tests, and production build. Playwright E2E (including axe and responsive screenshots) is a separate gate so the browser suite can use an isolated database and fixed environment.

The session policy retains at most three prior token generations, each for up to eight in-flight uses within 10 seconds. Prior-token responses never emit a replacement cookie, so delayed requests and out-of-order responses cannot roll the browser back to a stale token. Login backoff is source-scoped and retains at most 1,024 source buckets. When deploying behind TLS termination, configure the proxy to strip and replace `X-Real-IP` and `X-Forwarded-For`; never pass client-supplied values through. Missing or malformed source values share the direct-client bucket.

The suite invokes the real backup/restore-check CLIs and covers migration checksums, owner-safe joins, setup takeover defenses, session rotation/cookies/expiry/rate limiting/origin checks, streamed body limits, onboarding rollback, immutable planning/progression records, guarded owner-wide hard deletion, timezone boundaries, deterministic briefings, dependency direction, SQL/Drizzle alignment, and the hard-disabled AI posture.

## Scope

See [architecture](docs/architecture.md) and [privacy contract](docs/privacy-contract.md). All tests use synthetic identities and life data. Committed visual evidence lives under `docs/qa/screenshots/`.

## License

MIT, see [LICENSE](LICENSE).
