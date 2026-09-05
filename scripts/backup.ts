import fs from "node:fs";
import path from "node:path";
import { parseConfig } from "@/infrastructure/config/env";
import { openDatabase } from "@/infrastructure/db/client";

async function main(): Promise<void> {
  const config = parseConfig(process.env);
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const target = args[0];
  if (!target || args.length !== 1)
    throw new Error(
      "Usage: corepack pnpm backup -- <explicit-new-target.sqlite>",
    );
  const source = path.resolve(config.DATABASE_PATH);
  const resolved = path.resolve(target);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile())
    throw new Error("Backup source does not exist or is not a regular file.");
  if (resolved === source)
    throw new Error("Backup target must differ from the source database.");
  if (fs.existsSync(resolved))
    throw new Error("Backup target must be a new file; refusing to overwrite.");
  const parent = path.dirname(resolved);
  const parentExisted = fs.existsSync(parent);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (fs.realpathSync(parent) !== parent)
    throw new Error("Backup target parent must not traverse a symbolic link.");
  if (!parentExisted) fs.chmodSync(parent, 0o700);
  const reserved = fs.openSync(resolved, "wx", 0o600);
  fs.closeSync(reserved);
  let connection: ReturnType<typeof openDatabase> | undefined;
  try {
    connection = openDatabase(source);
    await connection.sqlite.backup(resolved);
    fs.chmodSync(resolved, 0o600);
    if ((fs.statSync(resolved).mode & 0o777) !== 0o600)
      throw new Error("Backup permissions could not be secured.");
  } catch (error) {
    fs.rmSync(resolved, { force: true });
    throw error;
  } finally {
    connection?.sqlite.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Backup failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
