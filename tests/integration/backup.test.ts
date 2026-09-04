import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "@/infrastructure/db/client";
import { runMigrations } from "@/infrastructure/db/migrate";

describe("SQLite online backup", () => {
  it("restores synthetic owner data with integrity intact", async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "lifemaxing-backup-"),
    );
    try {
      const sourcePath = path.join(directory, "source.sqlite");
      const backupPath = path.join(directory, "backup.sqlite");
      const source = openDatabase(sourcePath);
      runMigrations(source, path.resolve("migrations"));
      const now = "2026-09-03T12:00:00Z";
      source.sqlite
        .prepare(
          "INSERT INTO owner(id,display_name,timezone,created_at,updated_at) VALUES ('o1','Synthetic','UTC',?,?)",
        )
        .run(now, now);
      await source.sqlite.backup(backupPath);
      source.sqlite.close();
      const restored = openDatabase(backupPath);
      expect(
        restored.sqlite.prepare("PRAGMA integrity_check").pluck().get(),
      ).toBe("ok");
      expect(
        restored.sqlite.prepare("SELECT display_name FROM owner").pluck().get(),
      ).toBe("Synthetic");
      restored.sqlite.close();
    } finally {
      fs.rmSync(directory, { recursive: true });
    }
  });
});
