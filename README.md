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

Owner setup is accepted once, only from the configured localhost origin. The password is submitted in the request body over localhost/TLS and stored only as an Argon2id hash. Never put passwords in arguments, environment files, fixtures, or logs.

For a production-mode local run, build first and use `./run.sh`. Data defaults to the ignored `./data` directory with directory mode 0700.

## Checks

```sh
corepack pnpm verify
```

The suite covers migrations, owner scope, setup/session behavior, onboarding and planning invariants, timezone boundaries, deterministic briefings, dependency direction, and the hard-disabled AI posture.

## Scope

See [architecture](docs/architecture.md) and [privacy contract](docs/privacy-contract.md). All tests use synthetic identities and life data.
