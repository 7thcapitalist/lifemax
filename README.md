# Lifemaxing

Private, single-owner foundation for a quiet morning ritual. This delivery provides the repository/privacy foundation and backend onboarding skeleton; it deliberately does not provide a substantial UI, external AI, telemetry, or provider integrations.

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

Owner setup is closed by default. For the first run only, keep the server bound directly to loopback, set `SETUP_MODE=local`, create the owner through the local application, then stop it and return `SETUP_MODE=disabled` before normal use. The route additionally requires an exact configured Origin and localhost request host, and the database closes setup permanently after one owner. Do not expose this provisioning window through a proxy or tunnel.

The password is submitted only in the request body over localhost/TLS and stored only as an Argon2id hash. Never put passwords in arguments, environment files, fixtures, or logs.

For a production-mode local run, build first and use `./run.sh`. Data defaults to the ignored `./data` directory with directory mode 0700.

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
```

The session policy permits up to eight in-flight uses of the immediately previous token within 10 seconds; those responses never emit a replacement cookie. Login backoff is source-scoped and retains at most 1,024 source buckets. When deploying behind TLS termination, configure the proxy to strip and replace `X-Real-IP` and `X-Forwarded-For`; never pass client-supplied values through. Missing or malformed source values share the direct-client bucket.

The suite invokes the real backup/restore-check CLIs and covers migration checksums, owner-safe joins, setup takeover defenses, session rotation/cookies/expiry/rate limiting/origin checks, streamed body limits, onboarding rollback, immutable planning/progression records, guarded owner-wide hard deletion, timezone boundaries, deterministic briefings, dependency direction, SQL/Drizzle alignment, and the hard-disabled AI posture.

## Scope

See [architecture](docs/architecture.md) and [privacy contract](docs/privacy-contract.md). All tests use synthetic identities and life data.
