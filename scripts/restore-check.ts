import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { validateMigrationHistory } from "@/infrastructure/db/migrate";

function main(): void {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const candidate = args[0];
  if (!candidate || args.length !== 1)
    throw new Error("Usage: corepack pnpm restore:check -- <backup.sqlite>");
  const resolved = path.resolve(candidate);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile())
    throw new Error(
      "Restore candidate does not exist or is not a regular file.",
    );
  const database = new Database(resolved, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const result = database.pragma("integrity_check", { simple: true });
    if (result !== "ok")
      throw new Error("Restore candidate failed integrity_check.");
    validateMigrationHistory({ sqlite: database }, path.resolve("migrations"));
  } finally {
    database.close();
  }
}

try {
  main();
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Restore integrity check failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
