import path from "node:path";
import { parseConfig } from "@/infrastructure/config/env";
import { openDatabase } from "@/infrastructure/db/client";
import { runMigrations } from "@/infrastructure/db/migrate";

const config = parseConfig(process.env);
const connection = openDatabase(
  config.DB_DRIVER === "sqlite"
    ? { ...config, DATABASE_PATH: path.resolve(config.DATABASE_PATH) }
    : config,
);
try {
  runMigrations(connection, path.resolve("migrations"));
} finally {
  connection.sqlite.close();
}
