import path from "node:path";
import { openDatabase } from "@/infrastructure/db/client";
import { runMigrations } from "@/infrastructure/db/migrate";
import type { Clock } from "@/application/ports/time";

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
  set(value: Date): void {
    this.current = value;
  }
}

export function migratedDatabase() {
  const connection = openDatabase(":memory:");
  runMigrations(connection, path.resolve("migrations"));
  return connection;
}

/**
 * The production driver. `openDatabase` routes `DB_DRIVER: "libsql"` through
 * the libsql package and its adapter, which is a different code path from
 * `migratedDatabase()` above even though both store rows in memory: the storage
 * backend is embedded either way, but the JavaScript statement wrapper — where
 * the pluck contract lives and where it broke — is the production one.
 * `tests/integration/libsql-contract.test.ts` asserts that this is really so.
 */
export function migratedLibsqlDatabase() {
  const connection = openDatabase({
    DB_DRIVER: "libsql",
    DATABASE_PATH: ":memory:",
    DATABASE_URL: ":memory:",
    DATABASE_AUTH_TOKEN: "synthetic",
  });
  runMigrations(connection, path.resolve("migrations"));
  return connection;
}
