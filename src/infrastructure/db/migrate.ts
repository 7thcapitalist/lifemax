import fs from "node:fs";
import path from "node:path";
import type { DatabaseConnection } from "./client";

export function runMigrations(
  connection: DatabaseConnection,
  migrationsDirectory: string,
): void {
  connection.sqlite.exec(
    "CREATE TABLE IF NOT EXISTS __lifemaxing_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const applied = connection.sqlite.prepare(
    "SELECT 1 FROM __lifemaxing_migrations WHERE name=?",
  );
  const record = connection.sqlite.prepare(
    "INSERT INTO __lifemaxing_migrations (name,applied_at) VALUES (?,?)",
  );
  const files = fs
    .readdirSync(migrationsDirectory)
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();
  for (const name of files) {
    if (applied.get(name)) continue;
    const sql = fs.readFileSync(path.join(migrationsDirectory, name), "utf8");
    connection.sqlite.transaction(() => {
      connection.sqlite.exec(sql);
      record.run(name, new Date().toISOString());
    })();
  }
}
