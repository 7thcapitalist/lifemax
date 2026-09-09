import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Libsql from "libsql";
import type { AppConfig } from "@/infrastructure/config/env";
import * as schema from "./schema";

type DatabaseConfig = Pick<
  AppConfig,
  "DB_DRIVER" | "DATABASE_PATH" | "DATABASE_URL" | "DATABASE_AUTH_TOKEN"
>;

type LibsqlRemoteOptions = ConstructorParameters<typeof Libsql>[1] & {
  authToken: string;
};

export function openDatabase(input: string | DatabaseConfig) {
  const config: DatabaseConfig =
    typeof input === "string"
      ? { DB_DRIVER: "sqlite", DATABASE_PATH: input }
      : input;
  if (config.DB_DRIVER === "sqlite" && config.DATABASE_PATH !== ":memory:") {
    const databasePath = config.DATABASE_PATH;
    const directory = path.dirname(databasePath);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
  }
  const sqlite: Database.Database =
    config.DB_DRIVER === "libsql"
      ? (new Libsql(config.DATABASE_URL!, {
          authToken: config.DATABASE_AUTH_TOKEN!,
        } as LibsqlRemoteOptions) as unknown as Database.Database)
      : new Database(config.DATABASE_PATH);
  if (config.DB_DRIVER === "sqlite")
    sqlite.function("lifemaxing_owner_delete_allowed", () => 0);
  sqlite.pragma("foreign_keys = ON");
  if (config.DB_DRIVER === "sqlite") {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("busy_timeout = 5000");
  }
  return {
    sqlite,
    db: drizzle(sqlite, { schema }),
    deleteOwnerGraph(ownerId: string): boolean {
      return sqlite.transaction(() => {
        sqlite
          .prepare("INSERT INTO owner_delete_guard(owner_id) VALUES (?)")
          .run(ownerId);
        const deleted =
          sqlite.prepare("DELETE FROM owner WHERE id=?").run(ownerId)
            .changes === 1;
        sqlite
          .prepare("DELETE FROM owner_delete_guard WHERE owner_id=?")
          .run(ownerId);
        return deleted;
      })();
    },
  };
}
export type DatabaseConnection = ReturnType<typeof openDatabase>;
