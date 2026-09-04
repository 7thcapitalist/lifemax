import path from "node:path";
import { parseConfig } from "@/infrastructure/config/env";
import { openDatabase } from "@/infrastructure/db/client";
import { runMigrations } from "@/infrastructure/db/migrate";

const config = parseConfig(process.env);
const connection = openDatabase(path.resolve(config.DATABASE_PATH));
try {
  runMigrations(connection, path.resolve("migrations"));
} finally {
  connection.sqlite.close();
}
