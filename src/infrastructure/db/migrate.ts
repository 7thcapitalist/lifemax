import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseConnection } from "./client";

function expectedMigrations(migrationsDirectory: string) {
  return fs
    .readdirSync(migrationsDirectory)
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort()
    .map((name) => {
      const sql = fs.readFileSync(path.join(migrationsDirectory, name), "utf8");
      return {
        name,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    });
}

export function validateMigrationHistory(
  connection: Pick<DatabaseConnection, "sqlite">,
  migrationsDirectory: string,
): void {
  const table = connection.sqlite
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='__lifemaxing_migrations'",
    )
    .get();
  if (!table) throw new Error("MIGRATION_HISTORY_MISSING");
  const columns = connection.sqlite
    .prepare("PRAGMA table_info(__lifemaxing_migrations)")
    .all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "checksum"))
    throw new Error("MIGRATION_CHECKSUM_COLUMN_MISSING");
  const expected = expectedMigrations(migrationsDirectory);
  const actual = connection.sqlite
    .prepare("SELECT name, checksum FROM __lifemaxing_migrations ORDER BY name")
    .all() as Array<{ name: string; checksum: string | null }>;
  const expectedByName = new Map(
    expected.map((migration) => [migration.name, migration]),
  );
  for (const row of actual) {
    const migration = expectedByName.get(row.name);
    if (!migration) throw new Error("MIGRATION_UNEXPECTED: " + row.name);
    if (!row.checksum)
      throw new Error("MIGRATION_CHECKSUM_MISSING: " + row.name);
    if (row.checksum !== migration.checksum)
      throw new Error("MIGRATION_CHECKSUM_MISMATCH: " + row.name);
  }
  const actualNames = new Set(actual.map((row) => row.name));
  for (const migration of expected)
    if (!actualNames.has(migration.name))
      throw new Error("MIGRATION_NOT_APPLIED: " + migration.name);
}

export function runMigrations(
  connection: DatabaseConnection,
  migrationsDirectory: string,
): void {
  connection.sqlite.exec(
    "CREATE TABLE IF NOT EXISTS __lifemaxing_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)",
  );
  const columns = connection.sqlite
    .prepare("PRAGMA table_info(__lifemaxing_migrations)")
    .all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "checksum")) {
    const legacyName = connection.sqlite
      .prepare("SELECT name FROM __lifemaxing_migrations ORDER BY name LIMIT 1")
      .pluck()
      .get() as string | undefined;
    if (legacyName)
      throw new Error("MIGRATION_CHECKSUM_MISSING: " + legacyName);
    connection.sqlite.exec(
      "ALTER TABLE __lifemaxing_migrations ADD COLUMN checksum TEXT",
    );
  }
  const applied = connection.sqlite.prepare(
    "SELECT checksum FROM __lifemaxing_migrations WHERE name=?",
  );
  const record = connection.sqlite.prepare(
    "INSERT INTO __lifemaxing_migrations (name,checksum,applied_at) VALUES (?,?,?)",
  );
  const files = fs
    .readdirSync(migrationsDirectory)
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();
  for (const name of files) {
    const sql = fs.readFileSync(path.join(migrationsDirectory, name), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const prior = applied.get(name) as { checksum: string | null } | undefined;
    if (prior?.checksum) {
      if (prior.checksum !== checksum)
        throw new Error("MIGRATION_CHECKSUM_MISMATCH: " + name);
      continue;
    }
    if (prior) throw new Error("MIGRATION_CHECKSUM_MISSING: " + name);
    connection.sqlite.transaction(() => {
      connection.sqlite.exec(sql);
      record.run(name, checksum, new Date().toISOString());
    })();
  }
}
