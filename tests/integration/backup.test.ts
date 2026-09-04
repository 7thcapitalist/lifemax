import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "@/infrastructure/db/client";
import { runMigrations } from "@/infrastructure/db/migrate";

function command(
  script: "backup" | "restore:check",
  candidate: string,
  databasePath: string,
) {
  return spawnSync("corepack", ["pnpm", script, "--", candidate], {
    cwd: path.resolve("."),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_PATH: databasePath,
      AI_MODE: "disabled",
    },
  });
}

describe("shipped SQLite backup and restore CLIs", () => {
  it("restores synthetic data, verifies integrity, and forces mode 0600", () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "lifemaxing-backup-"),
    );
    try {
      const sourcePath = path.join(directory, "source.sqlite");
      const permissive = path.join(directory, "existing-permissive");
      const backupPath = path.join(permissive, "backup.sqlite");
      fs.mkdirSync(permissive, { mode: 0o755 });
      fs.chmodSync(permissive, 0o755);
      const source = openDatabase(sourcePath);
      runMigrations(source, path.resolve("migrations"));
      const now = "2026-09-03T12:00:00Z";
      source.sqlite
        .prepare(
          "INSERT INTO owner(id,display_name,timezone,created_at,updated_at) VALUES ('o1','Synthetic','UTC',?,?)",
        )
        .run(now, now);

      const backedUp = command("backup", backupPath, sourcePath);
      source.sqlite.close();
      expect(backedUp.status, backedUp.stderr).toBe(0);
      expect(fs.statSync(backupPath).mode & 0o777).toBe(0o600);
      expect(fs.statSync(permissive).mode & 0o777).toBe(0o755);

      const checked = command("restore:check", backupPath, sourcePath);
      expect(checked.status, checked.stderr).toBe(0);

      const emptyLookalikePath = path.join(directory, "empty-lookalike.sqlite");
      const emptyLookalike = openDatabase(emptyLookalikePath);
      emptyLookalike.sqlite.exec(
        "CREATE TABLE __lifemaxing_migrations(name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)",
      );
      emptyLookalike.sqlite.close();
      const emptyChecked = command(
        "restore:check",
        emptyLookalikePath,
        sourcePath,
      );
      expect(emptyChecked.status).not.toBe(0);
      expect(emptyChecked.stderr).toContain("MIGRATION_NOT_APPLIED");

      const badChecksumPath = path.join(directory, "bad-checksum.sqlite");
      fs.copyFileSync(backupPath, badChecksumPath);
      const badChecksum = openDatabase(badChecksumPath);
      badChecksum.sqlite
        .prepare("UPDATE __lifemaxing_migrations SET checksum=?")
        .run("0".repeat(64));
      badChecksum.sqlite.close();
      const badChecked = command("restore:check", badChecksumPath, sourcePath);
      expect(badChecked.status).not.toBe(0);
      expect(badChecked.stderr).toContain("MIGRATION_CHECKSUM_MISMATCH");

      const unexpectedPath = path.join(directory, "unexpected.sqlite");
      fs.copyFileSync(backupPath, unexpectedPath);
      const unexpected = openDatabase(unexpectedPath);
      unexpected.sqlite
        .prepare(
          "INSERT INTO __lifemaxing_migrations(name,checksum,applied_at) VALUES (?,?,?)",
        )
        .run("9999_unexpected.sql", "0".repeat(64), "2026-09-03T12:00:00Z");
      unexpected.sqlite.close();
      const unexpectedChecked = command(
        "restore:check",
        unexpectedPath,
        sourcePath,
      );
      expect(unexpectedChecked.status).not.toBe(0);
      expect(unexpectedChecked.stderr).toContain("MIGRATION_UNEXPECTED");
      const restored = openDatabase(backupPath);
      expect(restored.sqlite.pragma("integrity_check", { simple: true })).toBe(
        "ok",
      );
      expect(
        restored.sqlite.prepare("SELECT display_name FROM owner").pluck().get(),
      ).toBe("Synthetic");
      restored.sqlite.close();

      expect(command("backup", backupPath, sourcePath).status).not.toBe(0);
      expect(command("backup", sourcePath, sourcePath).status).not.toBe(0);
    } finally {
      fs.rmSync(directory, { recursive: true });
    }
  }, 15_000);

  it("rejects a target path traversing a symbolic-link parent", () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "lifemaxing-backup-link-"),
    );
    try {
      const sourcePath = path.join(directory, "source.sqlite");
      const realTarget = path.join(directory, "real-target");
      const linkedTarget = path.join(directory, "linked-target");
      fs.mkdirSync(realTarget);
      fs.symlinkSync(realTarget, linkedTarget, "dir");
      const source = openDatabase(sourcePath);
      runMigrations(source, path.resolve("migrations"));
      source.sqlite.close();

      const result = command(
        "backup",
        path.join(linkedTarget, "backup.sqlite"),
        sourcePath,
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("must not traverse a symbolic link");
      expect(fs.existsSync(path.join(realTarget, "backup.sqlite"))).toBe(false);
    } finally {
      fs.rmSync(directory, { recursive: true });
    }
  });
});
