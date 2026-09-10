# Vercel deployment runbook

LifeMax remains a private, single-owner application. Vercel deployments use a durable remote libSQL database; local development continues to use a private SQLite file. AI and telemetry remain disabled.

## Required environment contract

Configure these values in the Vercel dashboard for each environment. Never put credentials in source control, shell arguments, or logs.

| Variable                  | Preview                             | Production                        |
| ------------------------- | ----------------------------------- | --------------------------------- |
| `DB_DRIVER`               | `libsql`                            | `libsql`                          |
| `DATABASE_URL`            | dedicated preview database URL      | dedicated production database URL |
| `DATABASE_AUTH_TOKEN`     | preview database token              | production database token         |
| `DATABASE_ENVIRONMENT`    | `preview`                           | `production`                      |
| `APP_ORIGIN`              | optional; derived from `VERCEL_URL` | canonical HTTPS production origin |
| `SETUP_MODE`              | `disabled`                          | `disabled`                        |
| `AI_MODE`                 | `disabled`                          | `disabled`                        |
| `NEXT_TELEMETRY_DISABLED` | `1`                                 | `1`                               |

Startup fails closed if Vercel is configured with local SQLite, if the database URL/token is absent, if preview and production tags do not match, or if production lacks a canonical HTTPS origin. Preview and production must use distinct databases and tokens.

The Vercel build command runs `next build` and then the checksum-verified migrations. Runtime startup independently validates that every migration is present and unchanged. Migration SQL is included in each API function bundle for this check.

## Provision the single owner

There is no public production setup endpoint. After the first successful migration, run the operator command from a trusted host with the deployment database variables supplied by a protected credential store. Place the password in a temporary owner-only regular file (mode `0600`), then run:

```sh
corepack pnpm db:provision-owner -- --display-name Owner --timezone UTC --password-file /private/path/owner-password
```

The password is never accepted on the command line or through an environment variable. The command validates migration history, hashes the password with the existing Argon2id policy, and relies on both a transaction and the database singleton constraint. A retry after success fails with `SETUP_CLOSED`. Securely delete the temporary password file after the command exits.

Keep `SETUP_MODE=disabled` on Vercel. The browser setup route remains available only for an explicitly enabled loopback-local development window.

## Production smoke

Run the smoke only against an isolated candidate deployment/database or the intended freshly provisioned private deployment. It signs in and, if onboarding is incomplete, writes a small synthetic onboarding record before verifying persistence and `/today`.

Supply `SMOKE_BASE_URL` and `SMOKE_PASSWORD_FILE` through the operator environment/protected filesystem, then run `corepack pnpm test:smoke:production`. The smoke checks:

1. public bootstrap is healthy, provisioned, and reports AI disabled;
2. sign-in sets a usable session;
3. authenticated bootstrap and CSRF work;
4. onboarding completes when needed and remains present on a second bootstrap;
5. authenticated `/api/v1/today` and the `/today` page return successfully.

The smoke fails immediately on the empty/bodyless bootstrap 500 that caused the original outage.

## Rollback and operations

- Keep the prior deployment available until the migration, provisioning, and smoke steps pass.
- Rolling back application code after migration `0002` preserves normal reads/writes, but the old build's rarely used owner-hard-delete operation is incompatible with the new remote-safe guard. Roll forward for that operation; do not reverse an applied migration.
- Migrations are additive and serialized with an immediate write transaction. Never edit an applied migration.
- If a deploy fails before migration completion, fix the configuration and redeploy; checksum validation prevents silent partial history.
- Backups and retention are managed by the selected hosted database provider. Restrict provider access to the operator and choose a region appropriate for the owner's private behavioral data.
- The only new egress is the configured database host. No AI, analytics, telemetry, calendar, health, or finance provider is enabled.
