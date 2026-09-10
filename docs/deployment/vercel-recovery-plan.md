# Vercel production recovery — root cause and implementation design

- Task: `task-ca3c3cdf`
- Stage: Architect (pre-implementation report + design)
- Date: 2026-09-08
- Reference production: <https://lifemax-umber.vercel.app> (repo `7thcapitalist/lifemax`)
- Status: **design ready for builder** — one advisory founder ratification checklist (§8), no work-blocking decision

## Builder pre-implementation verification (2026-09-09 UTC)

Before changing the runtime, the builder independently repeated the production probe. `GET /api/v1/bootstrap` returned HTTP 500 with an empty body and `x-vercel-id: cle1::iad1::dstln-1788916084030-0a4754e7c035`; the response and headers are preserved in `evidence/live-bootstrap-*`. The static shell still works, while its first runtime API call fails, so the user-visible result remains “Could not reach the private app.”

The assigned worktree has no Vercel CLI and is not linked to a Vercel project. Correlated function logs therefore remain unavailable from this execution environment. This is a tooling/access limitation, not a guessed diagnosis: the live response signature, route inspection below, and the reproducible synchronous write to the read-only deployment filesystem identify the failing call before the route can return its JSON error envelope.

The proposed synchronous driver was also checked before implementation: `libsql@0.5.29` documents remote libSQL connections and a `better-sqlite3`-compatible synchronous API; a local spike exercised prepare/get/all/run, transactions, and the existing SQL migrations. The spike confirmed the narrow adapter is viable. It also confirmed the report's warning that the existing user-defined trigger function must be removed from the remote path; the implementation replaces that connection-local escape hatch with database triggers that permit only an owner-rooted cascade.

---

## 1. Diagnosis (acceptance gate A1–A3)

### 1.1 Production evidence captured

| Probe                                                   | Result                                                                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET https://lifemax-umber.vercel.app/`                 | `200`, static prerendered shell (`x-nextjs-prerender: 1`, `x-vercel-cache: HIT`). Renders "Opening your morning…".                                           |
| `GET https://lifemax-umber.vercel.app/api/v1/bootstrap` | **`500`, `content-length: 0`, empty body.** `x-vercel-cache: MISS`, `x-vercel-id: cle1::iad1::x6dgl-…` (function executed in `iad1`, no matched error page). |

An empty-body `500` with no JSON envelope means the exception is thrown **before any handler code runs a `return`** — i.e. during module evaluation / runtime construction, not inside the `try` blocks of the route. The route's own error paths always return a JSON `errorResponse(...)`. Raw commands and outputs: `evidence/repro-commands.txt`.

Vercel function logs for the correlated request were **not** available to this stage (no linked Vercel project / CLI auth in the worktree). Per the handoff, the exact stack trace is therefore established by a **faithful local reproduction of the same code path** (below), not asserted from the HTTP response alone.

### 1.2 Execution path

`src/app/api/v1/bootstrap/route.ts` → `export const runtime = "nodejs"` → `GET()` calls `getRuntime()` →
`src/infrastructure/runtime.ts::runtime()` → `createRuntime()` (memoised on `globalThis`) →

1. `parseConfig(process.env)` (`src/infrastructure/config/env.ts`)
2. `openDatabase(config.DATABASE_PATH)` (`src/infrastructure/db/client.ts`)

`openDatabase()` for any non-`:memory:` path runs, **synchronously, at first request**:

```js
fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
fs.chmodSync(path.dirname(databasePath), 0o700);
const sqlite = new Database(databasePath);            // better-sqlite3 (native)
sqlite.function("lifemaxing_owner_delete_allowed", …); // custom SQL function
sqlite.pragma("journal_mode = WAL");
```

### 1.3 Primary failure (the exact thrown error)

**`createRuntime()` throws `EROFS/EACCES` from `fs.mkdirSync`/`fs.chmodSync` in `openDatabase()`, because `DATABASE_PATH` defaults to the relative path `./data/lifemaxing.sqlite`, which resolves against the read-only Vercel function bundle root (`/var/task`).**

The exception propagates out of `runtime()` → out of `GET()` (it is _outside_ the handler's `try`) → Next.js serialises it as a bare `500` with no body. This matches the observed `content-length: 0`.

Local reproduction (`evidence/repro-commands.txt`):

```
$ node -e 'fs.mkdirSync("/var/task/data",{recursive:true,mode:0o700})'
EXPECTED THROW: EACCES: permission denied, mkdir '/var/task/data'
```

On Vercel the same call against the read-only bundle FS throws `EROFS` (or `EACCES`); either way it is an unhandled synchronous throw during runtime construction.

### 1.4 Independent blockers (each would still break a fresh deploy after §1.3 is fixed)

| #   | Blocker                                                                                                                                                                                                                                                                                       | Evidence                                                                                                                                                                                                                        | Consequence                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | **No migration step runs on deploy.** Migrations only run via `run.sh` / `pnpm db:migrate` (local). `createRuntime()` opens the DB but never calls `runMigrations`.                                                                                                                           | `src/infrastructure/runtime.ts`, `run.sh`, `scripts/migrate.ts`. Local repro: fresh writable DB → `SELECT count(*) FROM owner` → `SQLITE_ERROR: no such table: owner`. `bootstrap.publicStatus()` calls `owners.count()` first. | Even with a writable path, first query `500`s.                                                                                                     |
| B2  | **Function-local storage is ephemeral.** `/tmp` (the only writable path) is per-instance and cleared between cold starts / instances.                                                                                                                                                         | Vercel runtime model; product handoff §Non-goals.                                                                                                                                                                               | Owner, sessions, onboarding, core-loop data do not survive cold starts, parallel instances, or redeploys. Fails acceptance B6.                     |
| B3  | **Owner provisioning is structurally impossible on Vercel.** `POST /api/v1/setup/owner` requires `SETUP_MODE==="local"` **and** `request.nextUrl.hostname ∈ {127.0.0.1, localhost, [::1]}` **and** no `forwarded`/`via`/non-loopback `x-forwarded-*` headers **and** `Origin === APP_ORIGIN`. | `src/app/api/v1/setup/owner/route.ts`.                                                                                                                                                                                          | Behind the Vercel proxy every condition fails → always `403 SETUP_LOCAL_ONLY`. No owner can ever be created.                                       |
| B4  | **`APP_ORIGIN` defaults to `http://127.0.0.1:3000`.** Sign-in and every mutation call `sameOrigin(request, APP_ORIGIN)`; `sessionCookieOptions` derives `Secure` from `APP_ORIGIN.startsWith("https://")`.                                                                                    | `src/infrastructure/config/env.ts`, `src/app/api/http.ts`, `src/app/api/v1/auth/session/route.ts`.                                                                                                                              | With the default, `POST /api/v1/auth/session` from the real origin → `403 ORIGIN`; session cookie would not be `Secure`. Fails acceptance C11–C12. |
| B5  | **Gate page dead-ends on `hasOwner:false`.** `src/app/page.tsx` routes an unprovisioned production user to `/setup`, which only shows "Setup is closed".                                                                                                                                      | `src/app/page.tsx`, `src/app/setup/page.tsx`.                                                                                                                                                                                   | Even after §1.3/B1 fixed, a fresh deploy has no usable first-run path.                                                                             |

### 1.5 Explicitly checked — result per item (acceptance A3)

| Item                                   | Finding                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node route runtime                     | `export const runtime = "nodejs"` on every `/api/v1/*` route — **correct**, not implicated. Build output confirms all API routes are `ƒ` (dynamic Node functions).                                                                                                                                                                                    |
| `better-sqlite3` (native)              | **Not the primary failure.** `next build` traces `better_sqlite3.node` into the function bundle (`.next/server/app/api/v1/bootstrap/route.js.nft.json`). Vercel rebuilds it on its AL2/glibc build image. It loads fine (local repro opened a DB and queried). It is still unfit for Vercel because there is **no durable file** for it to open (B2). |
| `@node-rs/argon2` (native)             | **Not implicated.** `nft` traces both `argon2.linux-x64-gnu.node` and `…-musl.node` into the bundle. `linux-x64-gnu` matches the Vercel runtime.                                                                                                                                                                                                      |
| Filesystem writes                      | **Primary failure (§1.3).** `openDatabase()` unconditionally `mkdirSync`+`chmodSync` the DB directory. Read-only on Vercel except `/tmp`.                                                                                                                                                                                                             |
| `DATABASE_PATH` / DB connection config | Default `./data/lifemaxing.sqlite` (relative, bundle-root). No hosted-DB configuration exists. Must be replaced by a URL-addressed managed store (§3).                                                                                                                                                                                                |
| Migrations                             | **B1** — never executed on deploy. `runMigrations` / `validateMigrationHistory` logic is sound and reusable.                                                                                                                                                                                                                                          |
| `HOST`                                 | `z.literal("127.0.0.1")`. Vercel does **not** set `HOST` for functions, so the default applies and it is **not implicated** for request handling. It only constrains `next start` (local/self-host). Recommend relaxing (§4) so it cannot become a latent failure.                                                                                    |
| `APP_ORIGIN`                           | **B4** — loopback default breaks sign-in origin check + `Secure` cookie. `https://lifemax-umber.vercel.app` passes the existing `canonicalOrigin` zod validator (https, canonical, no path) — only needs to be set as an env var + a preview fallback.                                                                                                |
| `SETUP_MODE`                           | Default `disabled`; `local` is loopback-only by design. **B3** — provisioning route is intentionally unusable through a proxy; a separate production provisioning mechanism is required.                                                                                                                                                              |
| Forwarding headers                     | `loginRateLimitKey` / setup route read `x-forwarded-for` / `x-real-ip`. Vercel sets these from its trusted edge. Acceptable for rate-limiting; the setup route's strict rejection of them is what makes B3 absolute. Document Vercel as the trusted boundary (§4, §6).                                                                                |
| Vercel environment variables           | None set today beyond defaults. Required set defined in §4.                                                                                                                                                                                                                                                                                           |
| AI / telemetry                         | `AI_MODE` literal `disabled` (unchanged). `NEXT_TELEMETRY_DISABLED=1` in `package.json` scripts; also set as a Vercel env var. No provider SDK anywhere. Not implicated; must stay intact.                                                                                                                                                            |

### 1.6 Why `next build` success was insufficient

`/` and all page routes are statically prerendered (`○` in build output) — they emit HTML with **no** server data access. The DB, native modules, `APP_ORIGIN`, migrations, and provisioning are only exercised by the `ƒ` API functions **at request time**. `next build` never opens `openDatabase()`, never calls `parseConfig` with the production env, and never runs a migration. A green build proves the bundle compiles; it proves nothing about runtime persistence, filesystem, origin, or first-run.

---

## 2. Proposed design (smallest change that satisfies the contract)

Two ordered problems: **(A) a durable, Vercel-safe datastore** and **(B) a deploy-time schema + first-owner lifecycle**. Everything else is configuration.

### 2.1 Persistence — keep SQLite semantics, move the bytes off the function

Adopt **libSQL / Turso** (SQLite-compatible managed database, addressed by URL + auth token). This keeps the entire SQL dialect, both `.sql` migrations, every repository query, the partial unique indexes, `PRAGMA foreign_keys`, and the checksum migration table **unchanged**. Postgres/Neon would additionally force a full SQL-dialect and migration rewrite and is rejected as non-minimal (see §5).

Driver choice is a **reversible engineering decision** (product handoff). Two viable adapters, in preference order:

#### Option A (recommended, smallest blast radius): synchronous `libsql` package as a `better-sqlite3` drop-in

`libsql` (Turso's fork of `better-sqlite3`) exposes the **same synchronous API** (`new Database(url, { authToken })`, `.prepare`, `.get/.all/.run`, `.pluck`, `.exec`, `.transaction`, `.pragma`). It connects to a remote Turso DB over HTTP while keeping calls synchronous (blocking) — acceptable for a **single-owner** app with no request concurrency.

Change surface:

- `src/infrastructure/db/client.ts` — branch on `DB_DRIVER`: `"sqlite"` → `better-sqlite3` (unchanged, local + tests); `"libsql"` → `new (require("libsql"))(DATABASE_URL, { authToken: DATABASE_AUTH_TOKEN })`. Both return the existing `{ sqlite, db, deleteOwnerGraph }` shape. `drizzle(sqlite, { schema })` via `drizzle-orm/better-sqlite3` is retained for both (libSQL's `Database` is call-compatible — **must be spike-confirmed**, §7).
- Skip the `fs.mkdirSync`/`chmodSync` block when `DB_DRIVER !== "sqlite"` (removes the §1.3 throw).
- `deleteOwnerGraph` — replace the `sqlite.function("lifemaxing_owner_delete_allowed", …)` guard (user-defined SQL functions do **not** execute on a remote libSQL connection) with an application-layer boolean guard + ordered `DELETE FROM owner WHERE id=?` inside a `sqlite.transaction(...)` (schema already cascades from `owner`). ~15 lines; this path is privacy tooling, not the D1 critical path.
- **No change** to `application/`, `domain/`, `infrastructure/db/repositories.ts`, `infrastructure/db/migrate.ts`, or any test — they stay synchronous.

#### Option B (fallback if the spike fails): async `@libsql/client` + `drizzle-orm/libsql`

Battle-tested, but `TransactionPort.run<T>(work): T` → `Promise<T>`, and **every** repository method + every calling application service + every integration test that touches the DB becomes `async`. Mechanical (no logic change) but hundreds of call sites and the full integration-test suite. Only take this if Option A's spike shows a real incompatibility or unacceptable latency.

> The builder must run the §7 spike **first** and record which option is in effect in the PR.

### 2.2 Migration lifecycle (B1, acceptance B7)

- **Deploy-time execution:** add a `vercel-build` npm script = `next build && pnpm db:migrate` (or `vercel.json` `buildCommand`). `scripts/migrate.ts` already resolves `DATABASE_PATH`; extend it to use the same `DB_DRIVER`/`DATABASE_URL` selection. Migrations then run against the target environment's DB during each deploy, visible in the Vercel build log — "separately observable". Preview builds migrate the preview DB; production build migrates production.
- **Concurrency safety:** wrap the migration run in a single libSQL write transaction (`BEGIN IMMEDIATE` acquires the write lock; `busy_timeout` already set). Two concurrent deploys → one waits, then sees the checksum rows and no-ops. Per-file work is already `INSERT`-guarded + checksummed in `runMigrations`.
- **Fail-closed startup check:** `createRuntime()` calls the existing `validateMigrationHistory(connection, "migrations")` once per instance (memoised). On `MIGRATION_*` errors it throws a typed `StoreUnavailableError`; the route layer maps it to `errorResponse(503, "STORE_UNAVAILABLE", "The private app is temporarily unavailable.")` — never a bare `500`, never leaking the underlying message.
- **Backward-compatibility rule:** because the previous deployment keeps serving from the same DB until promotion, each migration must be compatible with the prior app version for one release (expand now, contract later). Documented in the PR's migration/rollback notes.

### 2.3 First-owner provisioning (B3, B5, acceptance C9–C10)

**Operator command, no public route** (product-preferred, minimal attack surface):

- New `scripts/provision-owner.ts` — one-shot, run by the operator against `DATABASE_URL` (locally, or `vercel env pull` + `node`). Reads `displayName`, `timezone`, and the password from an **interactive prompt or a `--password-file` path**; never from argv, env that is logged, or stdout. Calls the existing `AuthService.setupOwner` semantics: transaction → `if owners.count() !== 0 throw SETUP_CLOSED` → `createWithCredential`.
- **Race / retry safety:** the schema already enforces `unique("owner_singleton")` + `CHECK(singleton_key = 1)`. Two concurrent runs → second `INSERT` violates the constraint → fails closed. A retry after a committed owner → `SETUP_CLOSED`. Exactly one owner, always.
- **Closed after success:** provisioning is a manual command, not an endpoint — there is nothing to "close". `POST /api/v1/setup/owner` stays exactly as-is (loopback + `SETUP_MODE=local` only) for local development; it remains inert on Vercel.
- `src/app/page.tsx` / `src/app/setup/page.tsx` — when `hasOwner:false` **and** the deployment is not local (`setupMode==="disabled"`), the gate shows a neutral "This private space has not been set up yet." message instead of routing to the setup form. Small copy/branch change; no new capability.

### 2.4 Environment & origin (B4, acceptance C11–C12)

`src/infrastructure/config/env.ts` gains explicit, environment-aware validation (§4). Key points:

- `APP_ORIGIN` **required and canonical HTTPS** when `VERCEL_ENV==="production"`. When `VERCEL_ENV==="preview"` and `APP_ORIGIN` is unset, fall back to `https://${VERCEL_URL}` (satisfies the existing `canonicalOrigin` validator). Loopback default retained only for local.
- `DB_DRIVER` defaults to `"sqlite"`; **must** be `"libsql"` with a non-empty `DATABASE_URL` when `VERCEL==="1"`. If `NODE_ENV==="production"` / on Vercel and the driver resolves to `"sqlite"` or the URL is missing → **throw at parse time** ("can never silently fall back to ephemeral storage").
- Preview isolation: when `VERCEL_ENV==="preview"`, assert `DATABASE_URL !== <production URL>` (compare against a required `PRODUCTION_DATABASE_HOST` guard value, or a `DB_ENV_TAG` that must equal `VERCEL_ENV`). Mismatch → throw. Covers "preview accidentally pointed at production → fail closed".
- `HOST` — relax to `z.string().default("127.0.0.1")`; keep the loopback assertion **only** where it is security-relevant (the `SETUP_MODE==="local"` path). It is irrelevant to Vercel functions.
- `NEXT_TELEMETRY_DISABLED=1`, `AI_MODE=disabled` — set as Vercel env vars; `AI_MODE` zod literal unchanged.

### 2.5 Runtime error boundary

Add a small wrapper so any `createRuntime()` failure (store unreachable, migration mismatch, missing env) surfaces as a sanitized `503` JSON envelope with a `requestId`, not an empty `500`. Applied in `runtime()` consumers via a `getRuntimeOrError()` helper used by each route's top line, or a shared `withRuntime(handler)` wrapper.

---

## 3. Files / components affected (cause → change)

| Cause / requirement                   | File(s)                                                                                                         | Change                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| §1.3 read-only FS throw               | `src/infrastructure/db/client.ts`                                                                               | Driver branch; guard `fs.*` behind `DB_DRIVER==="sqlite"`; libSQL connector.                                             |
| §1.3 `.function()` unsupported remote | `src/infrastructure/db/client.ts` (`deleteOwnerGraph`)                                                          | App-layer guard + cascade delete; drop `sqlite.function(...)`.                                                           |
| B1 migrations on deploy               | `package.json` (`vercel-build`), new `vercel.json`, `scripts/migrate.ts`                                        | Run migrations at build against target DB; driver-aware.                                                                 |
| B1 concurrency + fail-closed          | `src/infrastructure/db/migrate.ts`, `src/infrastructure/runtime.ts`                                             | Outer write-lock transaction; call `validateMigrationHistory` on cold start; typed `StoreUnavailableError`.              |
| B2 durable store selection            | `src/infrastructure/config/env.ts`                                                                              | `DB_DRIVER`, `DATABASE_URL`, `DATABASE_AUTH_TOKEN`; prod requires libsql; no silent sqlite fallback.                     |
| B3 provisioning                       | new `scripts/provision-owner.ts`                                                                                | Operator one-shot; prompt/file password; singleton-safe.                                                                 |
| B4 origin / Secure cookie             | `src/infrastructure/config/env.ts` (+ verify `src/app/api/http.ts::sessionCookieOptions`)                       | `APP_ORIGIN` required in prod, `VERCEL_URL` preview fallback.                                                            |
| B5 first-run UX                       | `src/app/page.tsx`, `src/app/setup/page.tsx`                                                                    | Neutral "not provisioned" state on non-local deployments.                                                                |
| preview↔prod isolation               | `src/infrastructure/config/env.ts` / startup assert                                                             | Fail closed if preview URL == prod URL.                                                                                  |
| runtime error surface                 | `src/infrastructure/runtime.ts`, route top-lines or shared wrapper                                              | `503 STORE_UNAVAILABLE` instead of empty `500`.                                                                          |
| regression coverage                   | new `tests/smoke/**`, `vitest.config.ts` (new `smoke` project or standalone runner), `.github/workflows/ci.yml` | Production smoke path (§6).                                                                                              |
| integration parity                    | `tests/helpers.ts` (+ optional libSQL `file:` variant), `tests/integration/migrations.test.ts`                  | Optionally run migration/integration suite against libSQL `file:` mode too.                                              |
| docs                                  | `README.md`, `docs/privacy-contract.md`, new `docs/deployment/vercel.md`, `context/DECISIONS.md`                | Env contract, provider privacy (region/encryption/retention/isolation), rollback, provisioning runbook, decision record. |
| deps                                  | `package.json`, `pnpm-lock.yaml`                                                                                | Add `libsql` (Option A) or `@libsql/client` (Option B). No AI/telemetry deps.                                            |

Package additions must pass `pnpm audit:prod --audit-level high` (existing CI step).

---

## 4. Environment variable contract

| Variable                  | Local (`.env.local`)          | Vercel Preview                  | Vercel Production                              | Notes                                  |
| ------------------------- | ----------------------------- | ------------------------------- | ---------------------------------------------- | -------------------------------------- |
| `DB_DRIVER`               | `sqlite` (default)            | `libsql`                        | `libsql`                                       | Prod/Vercel reject `sqlite`.           |
| `DATABASE_URL`            | `./data/lifemaxing.sqlite`    | `libsql://lifemax-preview-…`    | `libsql://lifemax-prod-…`                      | Preview ≠ Production (asserted).       |
| `DATABASE_AUTH_TOKEN`     | —                             | preview token                   | production token                               | Vercel-encrypted; never logged.        |
| `APP_ORIGIN`              | `http://127.0.0.1:3000`       | unset → `https://${VERCEL_URL}` | `https://lifemax-umber.vercel.app` (canonical) | Drives origin check + `Secure` cookie. |
| `SETUP_MODE`              | `local` only during first-run | `disabled`                      | `disabled`                                     | Provisioning is the operator script.   |
| `AI_MODE`                 | `disabled`                    | `disabled`                      | `disabled`                                     | zod literal.                           |
| `NEXT_TELEMETRY_DISABLED` | `1`                           | `1`                             | `1`                                            | Build + runtime.                       |
| `HOST` / `PORT`           | loopback / 3000               | n/a                             | n/a                                            | Ignored by Vercel functions.           |

`.env.example` updated to show the `DB_DRIVER=sqlite` local default and document the `libsql` production keys (placeholders only).

---

## 5. Key tradeoffs

1. **libSQL/Turso vs Vercel Postgres/Neon.** libSQL keeps 100 % of the SQL, migrations, and repository code; Postgres would rewrite every `.sql` file, the checksum-migration table, partial indexes, boolean/timestamp handling, and `sqlite_master` introspection. → **libSQL.** Portability note: if the founder rejects Turso, Option B's async shape is provider-agnostic but Postgres still adds the dialect rewrite.
2. **Sync `libsql` drop-in (Option A) vs async `@libsql/client` (Option B).** A: ~3 files, zero changes to app/domain/tests, but blocking network per statement (fine for one user) and needs a compatibility spike + `.function()` removal. B: correct and well-trodden, but async ripples through every repository method, service, and integration test. → **A, spike-gated; B as fallback.**
3. **Build-time migrations vs guarded-startup migrations.** Build-time is observable in deploy logs and keeps latency off the request path but needs DB creds in the build env (Vercel injects env into builds — acceptable). Startup-only adds a lock + latency to the first request and more concurrency surface. → **Build-time + startup verification.**
4. **Operator-command provisioning vs gated single-use route.** Command = zero public attack surface, needs an operator with DB access (the founder has it). Route = usable anywhere, larger secure-by-construction surface (capability token, single-use, atomic close, no-secret-in-logs). → **Operator command.**
5. **Two DB adapters (better-sqlite3 local, libSQL prod) vs one everywhere.** Two adapters risk dialect drift between test and prod. Mitigation: also run the migration + a slice of integration tests against libSQL `file:` mode in CI. Accepted because it preserves the fast hermetic `:memory:` test path.

---

## 6. Risks & failure modes

| Risk                                                                                 | Mitigation                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libsql` sync `Database` not drop-in compatible with `drizzle-orm/better-sqlite3`    | **Spike first (§7).** If it fails → Option B.                                                                                                                                                                                            |
| Blocking network latency on multi-statement transactions (onboarding, quest resolve) | Single-user app, no concurrency. Spike measures the heaviest path (onboarding complete) end-to-end; budget < 1 s. Turso region pinned near `iad1`.                                                                                       |
| Turso outage → app unavailable, no fallback (by design)                              | Sanitized `503 STORE_UNAVAILABLE`; never fall back to local SQLite (would silently lose data); documented operator runbook.                                                                                                              |
| Migration applied but previous deployment still live                                 | Expand/contract migrations; one-release backwards compatibility; rollback = revert PR + redeploy, DB retains data.                                                                                                                       |
| Preview deployment pointed at production DB                                          | Startup assertion: `VERCEL_ENV==="preview"` ⇒ `DATABASE_URL` must differ from the production host guard → throw.                                                                                                                         |
| Secrets in logs / argv / test artifacts                                              | Password via prompt/`--password-file`; `DATABASE_AUTH_TOKEN` only from Vercel env; smoke test asserts no secret/hash/token/cookie/body appears in its own output; CI uses an ephemeral Turso DB token stored as a GitHub Actions secret. |
| Cold-start cost of `validateMigrationHistory` every instance                         | Memoise runtime + validation result on `globalThis`; single cheap `SELECT`.                                                                                                                                                              |
| `next build` cache masks a broken migration script                                   | `vercel-build` runs `db:migrate` after `next build`; smoke test (§6) is the backstop and is designed to **fail against the current broken deploy**.                                                                                      |
| CSP `connect-src 'self'` blocks the DB call                                          | The libSQL call is **server-side** (Node function), not the browser — CSP does not apply. No CSP change; confirm in review.                                                                                                              |
| New outbound egress to `*.turso.io`                                                  | Provider egress (not AI). Covered by founder's hosted-storage approval; record as a decision (§8).                                                                                                                                       |

---

## 7. Mandatory de-risking spike (builder, before implementation)

Time-boxed (~1–2 h). Create a throwaway branch; do **not** ship the spike code.

1. `pnpm add libsql`; create a free Turso dev DB (operator-provided token).
2. `const db = drizzle(new (require("libsql"))(url, { authToken }), { schema })`.
3. Run both `migrations/*.sql` through `runMigrations` against it. Assert all foundation tables + checksum rows (mirror `tests/integration/migrations.test.ts`).
4. Exercise: `owners.count()`, `createWithCredential`, `findCredential`, `sessions.create` + `findByTokenHash` + `rotate`, `onboarding.complete` (heaviest transaction), `today.get`. Assert results match the better-sqlite3 baseline.
5. Measure wall-clock of `onboarding.complete` and `today.get` from `iad1`-equivalent latency.
6. Confirm `deleteOwnerGraph` reworked without `sqlite.function`.

**Pass** → Option A. **Fail** (API incompatibility, dialect error, or latency > budget) → Option B. Record the outcome + numbers in the PR.

---

## 8. Founder ratification checklist (advisory — for the existing pre-merge sign-off)

The founder already approved _hosted persistent storage on Vercel and production owner provisioning_. No new work-blocking decision. These items just need explicit sign-off at merge, matching the task's ADVISORY classification:

1. **Data processor identity.** Recommended: **Turso (libSQL)**. All personal behavioral data (habits, mood, reflections, quest history) will rest with this third party. Confirm acceptable, and choose **region** (US vs EU) and confirm **encryption at rest + in transit** and retention/backup posture.
2. **Billing owner.** Creating the production + preview + CI databases and auth tokens is an operator/founder action. Single-owner usage likely fits the free tier; any paid plan stays founder-controlled (acceptance criterion 16). Confirm who provisions and funds.
3. **New outbound egress.** Runtime will connect to `*.turso.io` (libSQL host). This is provider egress, **not** AI or telemetry. Record as an accepted decision (e.g. `LFX-2026-003`) alongside `LFX-2026-001`.
4. **Provisioning model.** Confirm the operator-run `provision-owner` command (no public setup route) is the desired mechanism.

If item 1 is rejected in favour of another provider, re-open only the driver/provider choice; the rest of this design (migration lifecycle, provisioning, env contract, error boundary, smoke test) is provider-independent.

---

## 9. Verification plan

**Repository suite (must stay green):**

- `pnpm verify` — `prettier --check`, `eslint --max-warnings=0`, `tsc --noEmit`, unit + integration + architecture vitest, `next build`.
- `pnpm audit:prod --audit-level high` — new dep passes.
- New: migration + a slice of integration tests also run against libSQL `file:` mode (fresh / upgrade / rerun / concurrent / checksum-mismatch).

**Vercel-like local reproduction:**

- `DB_DRIVER=libsql DATABASE_URL=<turso-dev> next build && next start` → `GET /api/v1/bootstrap` → `200 {authenticated:false,hasOwner:false,aiMode:"disabled"}`.
- Kill & restart the process → provision owner via script → sign in → `GET /api/v1/bootstrap` → `authenticated:true`; data persists across restart.

**Production smoke test** (`tests/smoke/production.smoke.ts`, params: `SMOKE_BASE_URL`, isolated `SMOKE_DATABASE_URL`):

1. `GET /api/v1/bootstrap` → `200`, `{authenticated:false,hasOwner:false,aiMode:"disabled"}` on empty DB. _(Fails against current `https://lifemax-umber.vercel.app` — `500`.)_
2. Provision owner against the smoke DB.
3. `GET /api/v1/bootstrap` → `hasOwner:true`.
4. `POST /api/v1/auth/session` (correct `Origin`, password) → `200`; `Set-Cookie: lifemaxing_session` has `Secure; HttpOnly; SameSite=Strict; Path=/`.
5. `GET /api/v1/bootstrap` with cookie → `authenticated:true`; rotation cookie behaviour intact.
6. `POST /api/v1/onboarding/complete` (cookie + CSRF) → `200`.
7. `GET /api/v1/today` → `200`; representative write (check-in) then read-back.
8. Fresh client / cold path → step-7 record still present (redeploy-equivalent).
9. Negative: wrong `Origin` → `403`; mutation without CSRF → `401`.
10. Cleanup confined to `SMOKE_DATABASE_URL`. Assert no secret/hash/token/cookie/body/personal record in smoke output.

- CI: new job runs the smoke test against the PR's Vercel **preview** deployment with its own ephemeral Turso DB. Not part of hermetic `pnpm verify`.

**Manual acceptance on a fresh deploy of the PR branch:**

- Visit `/` → neutral "not set up yet" (not an error). Run `provision-owner`. Reload → `/sign-in` → sign in → `/onboarding` → `/today`. Redeploy. Reload → still authenticated, `/today` record intact.

**Security / privacy checks:**

- `Set-Cookie` `Secure` present; wrong-origin `403`; CSRF-less mutation `401`; logout revokes.
- `AI_MODE` still literal `disabled`; no provider SDK added; `NEXT_TELEMETRY_DISABLED=1` visible in build log.
- Logs/artifacts scrubbed of secrets, hashes, tokens, cookies, bodies, personal data.
- `docs/deployment/vercel.md` documents provider region, encryption, access boundary (Vercel as trusted forwarding edge), retention/backups, preview isolation, and operator rollback.

---

## 10. Decision Card

**Not required as a work blocker.** The one founder-level choice — _use hosted persistent storage + production provisioning on Vercel_ — is already an accepted founder decision recorded in the handoff. The residual provider/region/billing/egress items are consolidated in §8 for the existing advisory pre-merge sign-off. The builder gate owns the task's high-risk authorization; this design introduces no public registration, no AI/telemetry, no scope change, and no privacy posture beyond the already-approved hosted store.
