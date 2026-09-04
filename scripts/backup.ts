import fs from "node:fs";
import path from "node:path";
import { parseConfig } from "@/infrastructure/config/env";
import { openDatabase } from "@/infrastructure/db/client";

const config = parseConfig(process.env);
const target = process.argv[2];
if (!target)
  throw new Error("Usage: pnpm tsx scripts/backup.ts <explicit-target.sqlite>");
const resolved = path.resolve(target);
fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
const connection = openDatabase(path.resolve(config.DATABASE_PATH));
try {
  await connection.sqlite.backup(resolved);
} finally {
  connection.sqlite.close();
}
