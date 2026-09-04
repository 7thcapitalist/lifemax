import { describe, expect, it } from "vitest";
import { migratedDatabase } from "../helpers";

describe("planning database invariants", () => {
  it("caps accepted quests and permits one immutable terminal outcome", () => {
    const { sqlite } = migratedDatabase();
    const now = "2026-09-03T12:00:00Z";
    sqlite
      .prepare(
        "INSERT INTO owner(id,display_name,timezone,created_at,updated_at) VALUES ('o1','Synthetic','UTC',?,?)",
      )
      .run(now, now);
    const insert = sqlite.prepare(`INSERT INTO quest
      (id,owner_id,local_date,title,done_condition,reason,size,source,status,role,accepted_size,accepted_at,created_at,updated_at)
      VALUES (?,'o1','2026-09-03',?,?,?,'small','owner','accepted',?,'small',?,?,?)`);
    insert.run("q1", "First", "Done", "Reason", "main", now, now, now);
    insert.run("q2", "Second", "Done", "Reason", "side", now, now, now);
    insert.run("q3", "Third", "Done", "Reason", "side", now, now, now);
    expect(() =>
      insert.run("q4", "Fourth", "Done", "Reason", "side", now, now, now),
    ).toThrow(/quest_daily_limit/);
    sqlite
      .prepare(
        `INSERT INTO quest_outcome(id,quest_id,owner_id,outcome,occurred_at,accepted_size)
      VALUES ('out1','q1','o1','completed',?,'small')`,
      )
      .run(now);
    expect(
      sqlite.prepare("SELECT status FROM quest WHERE id='q1'").pluck().get(),
    ).toBe("completed");
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO quest_outcome(id,quest_id,owner_id,outcome,occurred_at,accepted_size)
      VALUES ('out2','q1','o1','dropped',?,'small')`,
        )
        .run(now),
    ).toThrow();
    expect(() =>
      sqlite.prepare("UPDATE quest SET title='Changed' WHERE id='q1'").run(),
    ).toThrow(/quest_terminal/);
    sqlite.close();
  });
});
