# Lifemaxing

Private, single-owner morning ritual. **D1** delivers a playable manual vertical slice: owner setup, character onboarding, deterministic briefing, quest accept/edit/swap/decline/resolve, and the Today / Character / Chronicle surfaces. External AI, XP/levels, weekly review, Fitbit, telemetry, and notifications remain out of scope.

## Requirements

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
