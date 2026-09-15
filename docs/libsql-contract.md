# Where libsql diverges from better-sqlite3

`src/infrastructure/db/client.ts` opens a `libsql` connection and casts it to
`better-sqlite3`'s `Database` type. That cast is load-bearing: every repository
in the codebase is written against better-sqlite3's API, and TypeScript checks
it against better-sqlite3's declarations no matter which driver is underneath.

The cast was also wrong. `libsql@0.5.29` implements a _subset_ of the contract
and diverges from it silently in several places. This is the audit.

Method: every row-returning and connection-level method was run on both drivers
against identical fixtures and the results compared. The table is reproduced as
an executable differential suite in `tests/integration/libsql-contract.test.ts`,
so a future divergence fails a test rather than a page.

## Repaired in `libsql-adapter.ts`

| API                               | libsql's behaviour                                                                                                                                 | Contract                                          | Impact                                                                                                                                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pluck().get()`                   | **Returns the whole row object.** `get()` never reads the flag `pluck()` sets (`libsql/index.js:344`).                                             | First column's value.                             | **The production outage.** `{"coalesce(sum(delta),0)": n, _metadata: {…}}` reached React → error #31, white screen. 9 call sites in `repositories-game.ts`.                                          |
| `pluck().iterate()`               | Ignores pluck, yields row objects.                                                                                                                 | Yields first-column values.                       | Latent; no call site yet.                                                                                                                                                                            |
| `get()` (any mode)                | Appends a `_metadata` timing object to every row. `all()`/`iterate()` rows are clean.                                                              | Exactly the selected columns.                     | Leaks into anything that spreads a row — `mission()` and `characterSheet()` both do — and into API responses and `toEqual` comparisons.                                                              |
| `pluck()` / `raw()`               | Not mutually exclusive: `pluck` is JavaScript state, `raw` is native state, so both can be live and the result depends on which layer looks first. | One setting; last call wins.                      | `raw().pluck().get()` returned a raw array instead of a scalar.                                                                                                                                      |
| `pragma(s, {simple:true})`        | Built on `stmt.pluck().get()`, so it inherited the same defect and returned a row object.                                                          | The scalar value.                                 | Live in `scripts/restore-check.ts:21` and `tests/integration/backup.test.ts:97`. Also why **no assertion about `PRAGMA foreign_keys` could have been meaningful before this fix** — see issue #7 B2. |
| `expand()`                        | **Absent.** Calling it is a `TypeError: not a function`, not a clean failure.                                                                      | Row grouped by source table, `$` for expressions. | No call site; a trap for the next author.                                                                                                                                                            |
| `pluck()`/`raw()` on a non-reader | Accepted silently.                                                                                                                                 | Throws `TypeError`.                               | Hid mistakes instead of reporting them.                                                                                                                                                              |
| `Statement.source`                | `undefined`.                                                                                                                                       | The SQL the statement was prepared from.          | Degrades error reporting.                                                                                                                                                                            |
| `Statement.busy`                  | `undefined`.                                                                                                                                       | `true` while a cursor from `iterate()` is open.   | Latent.                                                                                                                                                                                              |
| `Database.name`                   | `""`.                                                                                                                                              | The database path/URL.                            | Degrades diagnostics.                                                                                                                                                                                |

## Not repairable — libsql throws "not implemented"

These fail loudly rather than silently, so they are documented rather than
worked around.

| API                                                     | Note                                                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `function()`                                            | Already handled: `client.ts` only registers `lifemaxing_owner_delete_allowed` on the sqlite driver, and migration `0002_remote_owner_delete` replaced it with a table guard for exactly this reason.          |
| `backup()`                                              | **`scripts/backup.ts:33` calls it.** Works on sqlite; throws on libsql. The backup CLI is sqlite-only today — it is not wired into a libsql deployment path, so this is a documented limit, not a live break. |
| `serialize()`, `aggregate()`, `table()`, `unsafeMode()` | No call sites.                                                                                                                                                                                                |

## Minor, left alone

- `run()` returns `{changes, lastInsertRowid, duration}` — an extra key, never read.
- `transaction()` works, but the returned function's `.database` is the raw
  connection rather than the adapter. No call site depends on it.

## What this audit does **not** cover

The divergences above live in libsql's **JavaScript `Statement` wrapper**, which
is the same code whether rows come from memory, a file, or a remote
`libsql://` server. That is why the differential suite is honest without a
network endpoint.

It says nothing about **backend** behaviour: SQL dialect differences, server-side
trigger and constraint enforcement, `PRAGMA` persistence across a pooled hrana
connection, replication, or network error mapping.

**Issue #7 B2 is still open on exactly that ground.** `PRAGMA foreign_keys`
reads back as `1` on the embedded engine, but whether it holds per-request over
a remote hrana/HTTP connection — and therefore whether owner erasure cascades
or silently orphans personal data — cannot be settled from here. It needs a real
remote endpoint.
