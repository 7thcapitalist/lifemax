import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export function openDatabase(databasePath: string) {
  if (databasePath !== ":memory:") {
    const directory = path.dirname(databasePath);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
  }
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
export type DatabaseConnection = ReturnType<typeof openDatabase>;
