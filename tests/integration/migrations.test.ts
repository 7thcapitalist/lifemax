import { describe, expect, it } from "vitest";
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
        "character_aspect",
        "quest",
        "briefing",
        "observation",
      ]),
    );
    expect(() =>
      connection.sqlite.prepare("PRAGMA integrity_check").get(),
    ).not.toThrow();
    connection.sqlite.close();
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
