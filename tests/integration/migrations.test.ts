import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "@/infrastructure/db/client";
import { runMigrations } from "@/infrastructure/db/migrate";
import { migratedDatabase } from "../helpers";

// Derived, never hard-coded. Two branches adding a migration in parallel each
// merge cleanly and then the count is wrong — which is exactly what happened
// here: this branch added the game migration while main added
// 0002_remote_owner_delete, and a literal 3 became a failing 4.
const MIGRATION_COUNT = fs
  .readdirSync(path.resolve("migrations"))
  .filter((name) => /^\d+.*\.sql$/.test(name)).length;

describe("migrations", () => {
  it("runs through the production libsql adapter without connection-local functions", () => {
    const connection = openDatabase({
      DB_DRIVER: "libsql",
      DATABASE_PATH: ":memory:",
      DATABASE_URL: ":memory:",
      DATABASE_AUTH_TOKEN: "synthetic",
    });
    runMigrations(connection, path.resolve("migrations"));
    expect(
      (
        connection.sqlite
          .prepare("SELECT count(*) AS value FROM __lifemaxing_migrations")
          .get() as { value: number }
      ).value,
    ).toBe(MIGRATION_COUNT);
    const now = "2026-09-09T00:00:00.000Z";
    connection.sqlite
      .prepare(
        "INSERT INTO owner(id,display_name,timezone,created_at,updated_at) VALUES ('remote-owner','Synthetic','UTC',?,?)",
      )
      .run(now, now);
    expect(connection.deleteOwnerGraph("remote-owner")).toBe(true);
    connection.sqlite.close();
  });
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
    ).toBe(MIGRATION_COUNT);
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
  // 0002_remote_owner_delete replaced the connection-local
  // `lifemaxing_owner_delete_allowed()` escape hatch with a table guard so the
  // rules also hold on a remote libSQL connection, which cannot register
  // connection-local functions at all. The game tables added afterwards must use
  // that same guard: a trigger written the old way still creates fine and then
  // fails at delete time with "no such function", reopening the hole 0002 shut.
  it("game deletion guards work on the libsql adapter, not just local sqlite", () => {
    const connection = openDatabase({
      DB_DRIVER: "libsql",
      DATABASE_PATH: ":memory:",
      DATABASE_URL: ":memory:",
      DATABASE_AUTH_TOKEN: "synthetic",
    });
    runMigrations(connection, path.resolve("migrations"));
    const now = "2026-09-09T00:00:00.000Z";
    connection.sqlite
      .prepare(
        "INSERT INTO owner(id,display_name,timezone,created_at,updated_at) VALUES ('o1','O','UTC',?,?)",
      )
      .run(now, now);
    connection.sqlite
      .prepare(
        "INSERT INTO coin_ledger(id,owner_id,entry_type,delta,reason,local_date,created_at) VALUES ('cl1','o1','award',5,'test','2026-09-09',?)",
      )
      .run(now);

    expect(() =>
      connection.sqlite.prepare("DELETE FROM coin_ledger WHERE id='cl1'").run(),
    ).toThrow(/coin_ledger_immutable/);

    connection.sqlite
      .prepare("INSERT INTO owner_delete_guard(owner_id) VALUES ('o1')")
      .run();
    connection.sqlite.prepare("DELETE FROM coin_ledger WHERE id='cl1'").run();
    expect(
      (
        connection.sqlite
          .prepare("SELECT count(*) AS value FROM coin_ledger")
          .get() as { value: number }
      ).value,
    ).toBe(0);
    connection.sqlite.close();
  });
  it("backfills game state without changing populated foundation rows", () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "lifemaxing-pre-game-"),
    );
    try {
      for (const name of ["0000_foundation.sql", "0001_swap_decline.sql"])
        fs.copyFileSync(
          path.resolve("migrations", name),
          path.join(directory, name),
        );
      const connection = openDatabase(":memory:");
      runMigrations(connection, directory);
      const now = "2026-09-03T12:00:00Z";
      connection.sqlite
        .prepare(
          "INSERT INTO owner(id,display_name,timezone,becoming_statement,setup_completed,created_at,updated_at,version) VALUES ('o1','Owner','UTC','Become steady',1,?,?,4)",
        )
        .run(now, now);
      connection.sqlite
        .prepare(
          "INSERT INTO character_aspect(id,owner_id,name,definition,desired_identity,emphasis,sort_order,level,created_at,updated_at,version) VALUES ('a1','o1','Custom','Defined','Identity','dormant',0,7,?,?,3)",
        )
        .run(now, now);
      connection.sqlite
        .prepare(
          "INSERT INTO north_star(id,owner_id,title,motivation,status,created_at,updated_at,version) VALUES ('n1','o1','North','Why','active',?,?,2)",
        )
        .run(now, now);
      connection.sqlite
        .prepare(
          "INSERT INTO chapter(id,owner_id,title,intent,start_date,end_date,status,created_at,updated_at,version) VALUES ('c1','o1','Chapter','Intent','2026-09-01','2026-10-01','active',?,?,2)",
        )
        .run(now, now);
      connection.sqlite
        .prepare(
          "INSERT INTO milestone(id,owner_id,chapter_id,title,done_condition,status,sort_order,created_at,updated_at,version) VALUES ('m1','o1','c1','Milestone','Done','active',0,?,?,2)",
        )
        .run(now, now);
      connection.sqlite
        .prepare(
          "INSERT INTO quest(id,owner_id,local_date,title,done_condition,reason,size,source,status,milestone_id,created_at,updated_at,version) VALUES ('q1','o1','2026-09-02','Quest','Done','Reason','small','owner','proposed','m1',?,?,1)",
        )
        .run(now, now);
      connection.sqlite
        .prepare(
          "UPDATE quest SET status='accepted',role='main',accepted_size='small',accepted_at=? WHERE id='q1'",
        )
        .run(now);
      connection.sqlite
        .prepare(
          "INSERT INTO quest_outcome(id,quest_id,owner_id,outcome,occurred_at,reflection,accepted_size) VALUES ('qo1','q1','o1','completed',?,'Kept history','small')",
        )
        .run(now);
      const before = {
        owner: connection.sqlite.prepare("SELECT * FROM owner").get(),
        aspect: connection.sqlite
          .prepare("SELECT * FROM character_aspect")
          .get(),
        star: connection.sqlite.prepare("SELECT * FROM north_star").get(),
        chapter: connection.sqlite
          .prepare(
            "SELECT id,owner_id,title,intent,start_date,end_date,status,created_at,updated_at,version FROM chapter",
          )
          .get(),
        milestone: connection.sqlite.prepare("SELECT * FROM milestone").get(),
        quest: connection.sqlite
          .prepare(
            "SELECT id,owner_id,local_date,title,done_condition,reason,size,source,status,role,milestone_id,life_lived,repeat_family_key,accepted_size,accepted_at,created_at,updated_at,version FROM quest",
          )
          .get(),
        outcome: connection.sqlite.prepare("SELECT * FROM quest_outcome").get(),
      };
      // In production order: the game triggers depend on the
      // `owner_delete_guard` table that 0002_remote_owner_delete creates.
      for (const name of [
        "0002_remote_owner_delete.sql",
        "0003_game_backend.sql",
        "0004_streak_arc.sql",
      ])
        fs.copyFileSync(
          path.resolve("migrations", name),
          path.join(directory, name),
        );
      runMigrations(connection, directory);
      expect(connection.sqlite.prepare("SELECT * FROM owner").get()).toEqual(
        before.owner,
      );
      expect(
        connection.sqlite.prepare("SELECT * FROM character_aspect").get(),
      ).toEqual(before.aspect);
      expect(
        connection.sqlite.prepare("SELECT * FROM north_star").get(),
      ).toEqual(before.star);
      expect(
        connection.sqlite
          .prepare(
            "SELECT id,owner_id,title,intent,start_date,end_date,status,created_at,updated_at,version FROM chapter",
          )
          .get(),
      ).toEqual(before.chapter);
      expect(
        connection.sqlite
          .prepare("SELECT length_days FROM chapter WHERE id='c1'")
          .pluck()
          .get(),
      ).toBeNull();
      expect(
        connection.sqlite
          .prepare(
            "SELECT count(*) FROM achievement_definition WHERE key='arc_completed'",
          )
          .pluck()
          .get(),
      ).toBe(1);
      expect(
        connection.sqlite.prepare("SELECT * FROM milestone").get(),
      ).toEqual(before.milestone);
      expect(
        connection.sqlite
          .prepare(
            "SELECT id,owner_id,local_date,title,done_condition,reason,size,source,status,role,milestone_id,life_lived,repeat_family_key,accepted_size,accepted_at,created_at,updated_at,version FROM quest",
          )
          .get(),
      ).toEqual(before.quest);
      expect(
        connection.sqlite.prepare("SELECT * FROM quest_outcome").get(),
      ).toEqual(before.outcome);
      expect(
        connection.sqlite
          .prepare(
            "SELECT progress_current progressCurrent,progress_target progressTarget FROM quest WHERE id='q1'",
          )
          .get(),
      ).toEqual({ progressCurrent: 1, progressTarget: 1 });
      expect(
        connection.sqlite
          .prepare("SELECT count(*) FROM character WHERE owner_id='o1'")
          .pluck()
          .get(),
      ).toBe(1);
      expect(
        connection.sqlite
          .prepare(
            "SELECT level,total_xp FROM attribute_progress WHERE owner_id='o1' AND aspect_id='a1'",
          )
          .get(),
      ).toEqual({ level: 7, total_xp: 0 });
      connection.sqlite.close();
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
