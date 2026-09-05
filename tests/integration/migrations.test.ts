import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "@/infrastructure/db/client";
import { runMigrations } from "@/infrastructure/db/migrate";
import { migratedDatabase } from "../helpers";

describe("migrations", () => {
  it("migrates an empty database idempotently with all foundation tables", () => {
    const connection = migratedDatabase();
    const names = connection.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(names).toEqual(
      expect.arrayContaining([
        "owner",
        "session",
        "session_token_history",
        "character_aspect",
        "quest",
        "briefing",
        "observation",
      ]),
    );
    expect(() =>
      connection.sqlite.prepare("PRAGMA integrity_check").get(),
    ).not.toThrow();
    const checksum = connection.sqlite
      .prepare("SELECT checksum FROM __lifemaxing_migrations")
      .pluck()
      .get();
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(
      connection.sqlite
        .prepare("SELECT count(*) FROM __lifemaxing_migrations")
        .pluck()
        .get(),
    ).toBe(2);
    connection.sqlite.close();
  });
  it("rejects edited migration history and unstamped legacy history", () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "lifemaxing-migrations-"),
    );
    try {
      const migration = path.join(directory, "0000_test.sql");
      fs.writeFileSync(migration, "CREATE TABLE sample (id TEXT PRIMARY KEY);");
      const connection = openDatabase(":memory:");
      runMigrations(connection, directory);
      fs.writeFileSync(
        migration,
        "CREATE TABLE sample (id TEXT PRIMARY KEY, changed TEXT);",
      );
      expect(() => runMigrations(connection, directory)).toThrow(
        /MIGRATION_CHECKSUM_MISMATCH: 0000_test.sql/,
      );
      connection.sqlite.close();

      const legacy = openDatabase(":memory:");
      legacy.sqlite.exec(
        "CREATE TABLE __lifemaxing_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO __lifemaxing_migrations VALUES ('0000_test.sql','2026-09-03T12:00:00Z');",
      );
      expect(() => runMigrations(legacy, directory)).toThrow(
        /MIGRATION_CHECKSUM_MISSING: 0000_test.sql/,
      );
      legacy.sqlite.close();
    } finally {
      fs.rmSync(directory, { recursive: true });
    }
  });
  it("enforces one owner, one active chapter, three active North Stars, and typed observations", () => {
    const { sqlite } = migratedDatabase();
    const now = "2026-09-03T12:00:00Z";
    sqlite
      .prepare(
        "INSERT INTO owner(id,display_name,timezone,created_at,updated_at) VALUES ('o1','Synthetic','UTC',?,?)",
      )
      .run(now, now);
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO owner(id,display_name,timezone,created_at,updated_at) VALUES ('o2','Other','UTC',?,?)",
        )
        .run(now, now),
    ).toThrow();
    sqlite
      .prepare(
        "INSERT INTO chapter(id,owner_id,title,intent,start_date,end_date,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .run(
        "c1",
        "o1",
        "One",
        "Focus",
        "2026-09-01",
        "2026-10-15",
        "active",
        now,
        now,
      );
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO chapter(id,owner_id,title,intent,start_date,end_date,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
        )
        .run(
          "c2",
          "o1",
          "Two",
          "Focus",
          "2026-09-01",
          "2026-10-15",
          "active",
          now,
          now,
        ),
    ).toThrow();
    const star = sqlite.prepare(
      "INSERT INTO north_star(id,owner_id,title,motivation,status,created_at,updated_at) VALUES (?,?,?,?,'active',?,?)",
    );
    for (let index = 0; index < 3; index += 1)
      star.run(`n${index}`, "o1", `Star ${index}`, "Synthetic", now, now);
    expect(() => star.run("n4", "o1", "Fourth", "Synthetic", now, now)).toThrow(
      /north_star_active_limit/,
    );
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO observation(id,owner_id,type,value_type,observed_start,ingested_at,provider,connection_id,source_record_id,source_revision,source_type,quality_status,import_batch_id,adapter_version,lifecycle_state)
      VALUES ('obs','o1','health.sleep.duration','number',?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          now,
          now,
          "fixture",
          "conn",
          "record",
          "1",
          "sleep",
          "normalized",
          "batch",
          "v1",
          "active",
        ),
    ).toThrow();
    sqlite.close();
  });
});
