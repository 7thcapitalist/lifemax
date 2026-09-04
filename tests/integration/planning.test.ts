import { describe, expect, it } from "vitest";
import { SqliteRepositories } from "@/infrastructure/db/repositories";
import { migratedDatabase } from "../helpers";

const NOW = "2026-09-03T12:00:00Z";

function seedOwnerAndAspect(
  sqlite: ReturnType<typeof migratedDatabase>["sqlite"],
) {
  sqlite
    .prepare(
      "INSERT INTO owner(id,display_name,timezone,created_at,updated_at) VALUES ('o1','Synthetic','UTC',?,?)",
    )
    .run(NOW, NOW);
  sqlite
    .prepare(
      "INSERT INTO character_aspect(id,owner_id,name,definition,desired_identity,emphasis,sort_order,created_at,updated_at) VALUES ('a1','o1','Builder','Build','Careful builder','active',0,?,?)",
    )
    .run(NOW, NOW);
}

function propose(
  sqlite: ReturnType<typeof migratedDatabase>["sqlite"],
  id: string,
  date = "2026-09-03",
) {
  sqlite
    .prepare(
      `INSERT INTO quest
       (id,owner_id,local_date,title,done_condition,reason,size,source,status,created_at,updated_at)
       VALUES (?,'o1',?,'Synthetic quest','Done','Reason','small','owner','proposed',?,?)`,
    )
    .run(id, date, NOW, NOW);
  sqlite
    .prepare(
      "INSERT INTO quest_aspect(owner_id,quest_id,aspect_id) VALUES ('o1',?,'a1')",
    )
    .run(id);
}

function accept(
  sqlite: ReturnType<typeof migratedDatabase>["sqlite"],
  id: string,
  role: "main" | "side",
) {
  sqlite
    .prepare(
      "UPDATE quest SET status='accepted',role=?,accepted_size=size,accepted_at=?,updated_at=?,version=version+1 WHERE id=?",
    )
    .run(role, NOW, NOW, id);
}

describe("planning database invariants", () => {
  it("enforces legal transitions, accepted partitions, and complete snapshots", () => {
    const { sqlite } = migratedDatabase();
    seedOwnerAndAspect(sqlite);
    for (const id of ["q1", "q2", "q3", "q4"]) propose(sqlite, id);
    accept(sqlite, "q1", "main");
    accept(sqlite, "q2", "side");
    accept(sqlite, "q3", "side");

    expect(() => accept(sqlite, "q4", "side")).toThrow(/quest_daily_limit/);
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO quest(id,owner_id,local_date,title,done_condition,reason,size,source,status,role,accepted_size,accepted_at,created_at,updated_at) VALUES ('bad','o1','2026-09-04','Bad','Done','Reason','small','owner','accepted','side','small',?,?,?)",
        )
        .run(NOW, NOW, NOW),
    ).toThrow(/quest_initial_state/);
    expect(() =>
      sqlite.prepare("UPDATE quest SET status='completed' WHERE id='q4'").run(),
    ).toThrow(/quest_illegal_transition/);

    for (const statement of [
      "UPDATE quest SET local_date='2026-09-04' WHERE id='q2'",
      "UPDATE quest SET role='main' WHERE id='q2'",
      "UPDATE quest SET title='Changed' WHERE id='q2'",
      "UPDATE quest SET life_lived=1 WHERE id='q2'",
      "UPDATE quest SET repeat_family_key='repeat' WHERE id='q2'",
      "UPDATE quest SET size='major' WHERE id='q2'",
      "UPDATE quest SET accepted_size='major' WHERE id='q2'",
    ])
      expect(() => sqlite.prepare(statement).run()).toThrow(
        /quest_accepted_snapshot_immutable/,
      );

    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO quest_aspect(owner_id,quest_id,aspect_id) VALUES ('o1','q2','a1')",
        )
        .run(),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare(
          "DELETE FROM quest_aspect WHERE owner_id='o1' AND quest_id='q2'",
        )
        .run(),
    ).toThrow(/quest_aspect_immutable/);
    sqlite.close();
  });

  it("rejects accepted quest deletion for every valid link shape", () => {
    const { sqlite } = migratedDatabase();
    seedOwnerAndAspect(sqlite);
    sqlite
      .prepare(
        "INSERT INTO chapter(id,owner_id,title,intent,start_date,end_date,status,created_at,updated_at) VALUES ('c1','o1','Chapter','Intent','2026-09-01','2026-10-15','active',?,?)",
      )
      .run(NOW, NOW);
    sqlite
      .prepare(
        "INSERT INTO milestone(id,owner_id,chapter_id,title,done_condition,status,sort_order,created_at,updated_at) VALUES ('m1','o1','c1','Milestone','Done','active',0,?,?)",
      )
      .run(NOW, NOW);
    for (const id of ["direct", "milestone", "dual"]) propose(sqlite, id);
    sqlite.prepare("DELETE FROM quest_aspect WHERE quest_id='milestone'").run();
    sqlite
      .prepare(
        "UPDATE quest SET milestone_id='m1' WHERE id IN ('milestone','dual')",
      )
      .run();
    accept(sqlite, "direct", "main");
    accept(sqlite, "milestone", "side");
    accept(sqlite, "dual", "side");

    for (const id of ["direct", "milestone", "dual"])
      expect(() =>
        sqlite.prepare("DELETE FROM quest WHERE id=?").run(id),
      ).toThrow(/quest_accepted_snapshot_immutable/);
    expect(sqlite.prepare("SELECT count(*) FROM quest").pluck().get()).toBe(3);
    sqlite.close();
  });

  it("makes outcomes single, immutable, consistent, and atomic on rollback", () => {
    const { sqlite } = migratedDatabase();
    seedOwnerAndAspect(sqlite);
    propose(sqlite, "q1");
    propose(sqlite, "q2");
    propose(sqlite, "q3");
    accept(sqlite, "q1", "main");
    accept(sqlite, "q2", "side");
    accept(sqlite, "q3", "side");

    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO quest_outcome(id,quest_id,owner_id,outcome,occurred_at,accepted_size) VALUES ('wrong-size','q1','o1','completed',?,'major')",
        )
        .run(NOW),
    ).toThrow(/quest_not_resolvable/);
    expect(
      sqlite.prepare("SELECT status FROM quest WHERE id='q1'").pluck().get(),
    ).toBe("accepted");

    sqlite
      .prepare(
        "INSERT INTO quest_outcome(id,quest_id,owner_id,outcome,occurred_at,accepted_size) VALUES ('out1','q1','o1','completed',?,'small')",
      )
      .run(NOW);
    expect(
      sqlite.prepare("SELECT status FROM quest WHERE id='q1'").pluck().get(),
    ).toBe("completed");
    propose(sqlite, "q4");
    expect(() => accept(sqlite, "q4", "side")).toThrow(/quest_daily_limit/);
    expect(() =>
      sqlite.prepare("UPDATE quest_outcome SET outcome='dropped'").run(),
    ).toThrow(/quest_outcome_immutable/);
    expect(() =>
      sqlite.prepare("DELETE FROM quest_outcome WHERE id='out1'").run(),
    ).toThrow(/quest_outcome_immutable/);
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO quest_outcome(id,quest_id,owner_id,outcome,occurred_at,accepted_size) VALUES ('out2','q1','o1','dropped',?,'small')",
        )
        .run(NOW),
    ).toThrow();
    expect(() =>
      sqlite.prepare("UPDATE quest SET status='attempted' WHERE id='q1'").run(),
    ).toThrow(/quest_terminal/);
    expect(() =>
      sqlite.prepare("DELETE FROM quest WHERE id='q1'").run(),
    ).toThrow(/quest_terminal/);

    expect(() =>
      sqlite.transaction(() => {
        sqlite
          .prepare(
            "INSERT INTO quest_outcome(id,quest_id,owner_id,outcome,occurred_at,accepted_size) VALUES ('rolled','q2','o1','attempted',?,'small')",
          )
          .run(NOW);
        throw new Error("synthetic rollback");
      })(),
    ).toThrow(/synthetic rollback/);
    expect(
      sqlite.prepare("SELECT status FROM quest WHERE id='q2'").pluck().get(),
    ).toBe("accepted");
    expect(
      sqlite
        .prepare("SELECT count(*) FROM quest_outcome WHERE id='rolled'")
        .pluck()
        .get(),
    ).toBe(0);
    sqlite.close();
  });

  it("permits owner-wide hard deletion only inside the guarded privacy context", () => {
    const connection = migratedDatabase();
    const { sqlite } = connection;
    const repositories = new SqliteRepositories(connection);
    seedOwnerAndAspect(sqlite);
    propose(sqlite, "accepted");
    propose(sqlite, "terminal", "2026-09-04");
    accept(sqlite, "accepted", "main");
    accept(sqlite, "terminal", "main");
    sqlite
      .prepare(
        "INSERT INTO quest_outcome(id,quest_id,owner_id,outcome,occurred_at,accepted_size) VALUES ('out','terminal','o1','completed',?,'small')",
      )
      .run(NOW);
    sqlite
      .prepare(
        "INSERT INTO evidence(id,owner_id,kind,factual_text,local_date,provenance_type,provenance_id,source_snapshot,created_at) VALUES ('e1','o1','quest_completion','Synthetic evidence','2026-09-04','quest','terminal','{}',?)",
      )
      .run(NOW);
    sqlite
      .prepare(
        "INSERT INTO evidence_link(evidence_id,owner_id,entity_type,entity_id) VALUES ('e1','o1','aspect','a1')",
      )
      .run();
    sqlite
      .prepare(
        "INSERT INTO xp_ledger(id,owner_id,aspect_id,evidence_id,points,rule_key,reason,awarded_at) VALUES ('xp1','o1','a1','e1',1,'completion','Synthetic award',?)",
      )
      .run(NOW);

    expect(() =>
      sqlite.prepare("DELETE FROM owner WHERE id='o1'").run(),
    ).toThrow(/immutable|quest_/);
    expect(repositories.privacy.deleteOwnerGraph("o1")).toBe(true);
    for (const table of [
      "owner",
      "quest",
      "quest_outcome",
      "evidence",
      "evidence_link",
      "xp_ledger",
    ])
      expect(
        sqlite
          .prepare("SELECT count(*) FROM " + table)
          .pluck()
          .get(),
      ).toBe(0);
    sqlite.close();
  });

  it("keeps evidence, links, and XP ledger append-only and owner-safe", () => {
    const { sqlite } = migratedDatabase();
    seedOwnerAndAspect(sqlite);
    sqlite
      .prepare(
        "INSERT INTO evidence(id,owner_id,kind,factual_text,local_date,provenance_type,provenance_id,source_snapshot,created_at) VALUES ('e1','o1','quest_completion','Synthetic evidence','2026-09-03','quest','q1','{}',?)",
      )
      .run(NOW);
    sqlite
      .prepare(
        "INSERT INTO evidence_link(evidence_id,owner_id,entity_type,entity_id) VALUES ('e1','o1','aspect','a1')",
      )
      .run();
    sqlite
      .prepare(
        "INSERT INTO xp_ledger(id,owner_id,aspect_id,evidence_id,points,rule_key,reason,awarded_at) VALUES ('xp1','o1','a1','e1',1,'completion','Synthetic award',?)",
      )
      .run(NOW);

    for (const statement of [
      "UPDATE evidence SET factual_text='Changed' WHERE id='e1'",
      "DELETE FROM evidence WHERE id='e1'",
      "UPDATE evidence_link SET entity_id='other' WHERE evidence_id='e1'",
      "DELETE FROM evidence_link WHERE evidence_id='e1'",
      "UPDATE xp_ledger SET points=2 WHERE id='xp1'",
      "DELETE FROM xp_ledger WHERE id='xp1'",
    ])
      expect(() => sqlite.prepare(statement).run()).toThrow(/immutable/);

    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO evidence_link(evidence_id,owner_id,entity_type,entity_id) VALUES ('e1','o1','quest','missing')",
        )
        .run(),
    ).toThrow(/evidence_link_owner_mismatch/);
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO briefing(id,owner_id,local_date,input_fingerprint,generator_version,generator_kind,mirror,generated_at,status) VALUES ('b1','o1','2026-09-03','hash','v1','deterministic','Mirror',?,'draft')",
        )
        .run(NOW),
    ).not.toThrow();
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO briefing_suggestion(id,briefing_id,owner_id,role,sort_order) VALUES ('s1','b1','other','main',0)",
        )
        .run(),
    ).toThrow();
    sqlite.close();
  });
});
