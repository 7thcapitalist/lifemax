import fs from "node:fs";
import path from "node:path";
import { AuthService } from "@/application/auth/service";
import { setupOwnerSchema } from "@/contracts/http";
import { SystemClock } from "@/infrastructure/clock/system";
import { parseConfig } from "@/infrastructure/config/env";
import { openDatabase } from "@/infrastructure/db/client";
import { validateMigrationHistory } from "@/infrastructure/db/migrate";
import { SqliteRepositories } from "@/infrastructure/db/repositories";

function valueAfter(flag: string): string {
  const index = process.argv.indexOf(flag);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error("INVALID_ARGUMENTS");
  return value;
}

function readPasswordFile(filename: string): string {
  const resolved = path.resolve(filename);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error("PASSWORD_FILE_UNSAFE");
  if ((stat.mode & 0o077) !== 0) throw new Error("PASSWORD_FILE_PERMISSIONS");
  const password = fs.readFileSync(resolved, "utf8").replace(/\r?\n$/, "");
  if (password.includes("\n") || password.includes("\r"))
    throw new Error("PASSWORD_FILE_MULTILINE");
  return password;
}

async function main() {
  const input = setupOwnerSchema.parse({
    displayName: valueAfter("--display-name"),
    timezone: valueAfter("--timezone"),
    password: readPasswordFile(valueAfter("--password-file")),
  });
  const config = parseConfig(process.env);
  const connection = openDatabase(
    config.DB_DRIVER === "sqlite"
      ? { ...config, DATABASE_PATH: path.resolve(config.DATABASE_PATH) }
      : config,
  );
  try {
    validateMigrationHistory(connection, path.resolve("migrations"));
    const repositories = new SqliteRepositories(connection);
    const auth = new AuthService(
      repositories.owners,
      repositories.sessions,
      repositories.transactions,
      new SystemClock(),
    );
    const result = await auth.setupOwner(input);
    process.stdout.write(`Owner provisioned: ${result.ownerId}\n`);
  } finally {
    connection.sqlite.close();
  }
}

main().catch((error: unknown) => {
  const safeCodes = new Set([
    "INVALID_ARGUMENTS",
    "PASSWORD_FILE_UNSAFE",
    "PASSWORD_FILE_PERMISSIONS",
    "PASSWORD_FILE_MULTILINE",
    "SETUP_CLOSED",
  ]);
  const message = error instanceof Error ? error.message : "UNKNOWN";
  process.stderr.write(
    `Owner provisioning failed: ${safeCodes.has(message) ? message : "INVALID_CONFIGURATION_OR_STORE"}\n`,
  );
  process.exitCode = 1;
});
