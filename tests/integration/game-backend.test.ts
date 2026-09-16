import { describe, expect, it } from "vitest";
import { SqliteRepositories } from "@/infrastructure/db/repositories";
import { SqliteGameRepositories } from "@/infrastructure/db/repositories-game";
import {
  DeterministicMissionGenerator,
  type MissionGenerator,
} from "@/domain/game-master/generator";
import { migratedDatabase, FixedClock } from "../helpers";
import { GameService } from "@/application/game/service";
import { IntlCalendarService } from "@/infrastructure/clock/system";
import type { GameMasterContext } from "@/lib/game-types";
import { consistencyPercent } from "@/domain/game/policy";
const now = "2026-09-09T12:00:00.000Z";
function setup() {
  const connection = migratedDatabase(),
    base = new SqliteRepositories(connection),
    game = new SqliteGameRepositories(connection);
  base.owners.createWithCredential({
    id: "00000000-0000-4000-8000-000000000001",
    displayName: "Owner",
    timezone: "UTC",
    passwordHash: "test",
    now,
  });
  base.owners.completeOnboarding(
    "00000000-0000-4000-8000-000000000001",
    {
      becomingStatement: "Become grounded",
      aspects: ["Custom A", "Custom B", "Custom C", "Custom D"].map(
        (name, index) => ({
          name,
          definition: "User defined",
          desiredIdentity: "Intent",
          emphasis: index === 1 ? ("dormant" as const) : ("active" as const),
        }),
      ),
      northStars: [],
      chapter: {
        title: "Chapter",
        intent: "Intent",
        startDate: "2026-09-01",
        endDate: "2026-10-01",
        milestones: [
          { title: "Milestone", doneCondition: "Done", aspectIndexes: [0] },
        ],
      },
      guardrails: [{ category: "recovery", statement: "Protect rest" }],
    },
    now,
  );
  return { connection, game, ownerId: "00000000-0000-4000-8000-000000000001" };
}
describe("game backend", () => {
  it("plans deterministically, completes once, and updates XP and coin ledgers atomically", () => {
    const { connection, game, ownerId } = setup();
    const context = game.gameMasterContext(ownerId, "2026-09-09", "low"),
      generated = new DeterministicMissionGenerator().generate(context),
      plan = game.savePlan(ownerId, "2026-09-09", now, generated, context);
    expect(plan.proposals[0]?.kind).toBe("rest");
    const attributeId = game.characterSheet(ownerId).attributes[0]!.id;
    const mission = game.createMission(
      ownerId,
      "2026-09-09",
      {
        title: "Meaningful task",
        doneCondition: "Finished",
        kind: "progress",
        size: "major",
        attributeIds: [attributeId],
        questId: null,
        chapterId: null,
        repeatFamilyKey: "family",
      },
      now,
    );
    game.updateMission(
      ownerId,
      mission.id,
      { status: "accepted", acceptedStretch: true },
      now,
    );
    const result = game.completeMission(
      ownerId,
      mission.id,
      "completion-1",
      now,
    );
    expect(result.coinAward).toBe(5);
    expect(result.xpAwards[0]!.points).toBeGreaterThan(0);
    expect(game.characterSheet(ownerId).wallet.coinBalance).toBe(5);
    expect(() =>
      game.completeMission(ownerId, mission.id, "completion-1", now),
    ).toThrow(/already completed/i);
    expect(
      connection.sqlite
        .prepare("SELECT count(*) FROM coin_ledger")
        .pluck()
        .get(),
    ).toBe(1);
    connection.sqlite.close();
  });
  it("still credits real XP when completing a protective mission with no declared attribute", () => {
    const { connection, game, ownerId } = setup();
    const mission = game.createMission(
      ownerId,
      "2026-09-09",
      {
        title: "Protect rest",
        doneCondition: "Took the evening off",
        kind: "rest",
        size: "small",
        attributeIds: [],
        questId: null,
        chapterId: null,
        repeatFamilyKey: null,
      },
      now,
    );
    game.updateMission(ownerId, mission.id, { status: "accepted" }, now);
    const result = game.completeMission(ownerId, mission.id, undefined, now);
    expect(result.coinAward).toBeGreaterThan(0);
    expect(result.xpAwards.length).toBeGreaterThan(0);
    expect(
      result.xpAwards.reduce((sum, award) => sum + award.points, 0),
    ).toBeGreaterThan(0);
    connection.sqlite.close();
  });
  it("rejects progress missions without attributes at the repository boundary", () => {
    const { connection, game, ownerId } = setup();
    expect(() =>
      game.createMission(
        ownerId,
        "2026-09-09",
        {
          title: "Unlinked progress",
          doneCondition: "Done",
          kind: "progress",
          size: "major",
          attributeIds: [],
          questId: null,
          chapterId: null,
          repeatFamilyKey: null,
        },
        now,
      ),
    ).toThrow(/require an attribute/i);

    const attributeId = game.characterSheet(ownerId).attributes[0]!.id;
    const mission = game.createMission(
      ownerId,
      "2026-09-09",
      {
        title: "Linked progress",
        doneCondition: "Done",
        kind: "progress",
        size: "major",
        attributeIds: [attributeId],
        questId: null,
        chapterId: null,
        repeatFamilyKey: null,
      },
      now,
    );

    expect(() =>
      game.updateMission(
        ownerId,
        mission.id,
        { attributeIds: [], status: "accepted" },
        now,
      ),
    ).toThrow(/require an attribute/i);
    expect(game.listMissions(ownerId, "2026-09-09")[0]).toMatchObject({
      id: mission.id,
      status: "proposed",
      attributeIds: [attributeId],
    });
    expect(game.characterSheet(ownerId).wallet.coinBalance).toBe(0);
    connection.sqlite.close();
  });
  it("keeps coins distinct from real-money vocabulary and rejects unaffordable rewards", () => {
    const { connection, game, ownerId } = setup();
    const reward = game.createReward(
      ownerId,
      { title: "Movie night", coinCost: 3, description: null },
      now,
    );
    expect(() =>
      game.redeemReward(ownerId, reward.id, "2026-09-09", now),
    ).toThrow(/coins/);
    const json = JSON.stringify({
      sheet: game.characterSheet(ownerId),
      rewards: game.listRewards(ownerId),
    });
    expect(json).not.toMatch(/money|cash|dollars|realMoney|price/i);
    expect(json).toContain("coinCost");
    connection.sqlite.close();
  });
  it("stores arbitrary academic categories and user-entered scales without inference", () => {
    const { connection, game, ownerId } = setup();
    const entry = game.createAcademic(
      ownerId,
      {
        kind: "independent seminar",
        title: "Systems",
        scoreValue: "Excellent",
        scoreScale: "narrative",
        status: "done",
      },
      now,
    );
    expect(entry).toMatchObject({
      kind: "independent seminar",
      scoreValue: "Excellent",
      scoreScale: "narrative",
    });
    expect(
      connection.sqlite
        .prepare("SELECT count(*) FROM academic_entry")
        .pluck()
        .get(),
    ).toBe(1);
    connection.sqlite.close();
  });
  it("passes explicit unknown values through the mockable generator port", () => {
    const connection = migratedDatabase(),
      base = new SqliteRepositories(connection),
      game = new SqliteGameRepositories(connection),
      ownerId = "00000000-0000-4000-8000-000000000002";
    base.owners.createWithCredential({
      id: ownerId,
      displayName: "Owner",
      timezone: "UTC",
      passwordHash: "test",
      now,
    });
    connection.sqlite
      .prepare("UPDATE owner SET setup_completed=1 WHERE id=?")
      .run(ownerId);
    connection.sqlite
      .prepare(
        "INSERT INTO character(id,owner_id,created_at,updated_at,version) VALUES (?,?,?,?,1)",
      )
      .run("00000000-0000-4000-8000-000000000003", ownerId, now, now);
    let received: GameMasterContext | undefined;
    const mock: MissionGenerator = {
      kind: "deterministic",
      generate(context) {
        received = context;
        return {
          generatorVersion: "mock-v1",
          planFingerprint: "mock-fingerprint",
          proposals: [
            {
              rank: 1,
              title: "Rest",
              doneCondition: "Pause",
              size: "small",
              kind: "rest",
              attributeIds: [],
              questId: null,
              chapterId: null,
              rationale: "All optional context is unknown.",
              citations: [],
            },
          ],
        };
      },
    };
    const service = new GameService(
      base.owners,
      game,
      new FixedClock(new Date(now)),
      new IntlCalendarService(),
      mock,
    );
    const result = service.dailyPlan(ownerId, {});
    expect(result.proposals).toHaveLength(1);
    expect(received).toMatchObject({
      becomingStatement: { status: "unknown", value: null },
      attributes: { status: "unknown", value: null },
      activeChapter: { status: "unknown", value: null },
      activeGuardrails: { status: "unknown", value: null },
      recentActivity: { status: "unknown", value: null },
      todayCheckIn: { status: "unknown", value: null },
    });
    connection.sqlite.close();
  });
  it("derives direct chapter progress and unlocks level-up only on a real level increase", () => {
    const { connection, game, ownerId } = setup();
    const sheet = game.characterSheet(ownerId);
    const attributeId = sheet.attributes[0]!.id;
    const chapterId = (
      connection.sqlite
        .prepare("SELECT id FROM chapter WHERE owner_id=? AND status='active'")
        .get(ownerId) as { id: string }
    ).id;
    connection.sqlite
      .prepare(
        "UPDATE attribute_progress SET level=7,xp_into_level=0 WHERE owner_id=? AND aspect_id=?",
      )
      .run(ownerId, attributeId);
    const mission = game.createMission(
      ownerId,
      "2026-09-09",
      {
        title: "Direct chapter action",
        doneCondition: "Done",
        kind: "progress",
        size: "small",
        attributeIds: [attributeId],
        questId: null,
        chapterId,
        repeatFamilyKey: "chapter-direct",
      },
      now,
    );
    game.updateMission(ownerId, mission.id, { status: "accepted" }, now);
    const completed = game.completeMission(ownerId, mission.id, undefined, now);
    expect(completed.chapterProgress).toEqual({ current: 1, target: 1 });
    expect(completed.newlyUnlockedAchievements).not.toContain(
      "first_attribute_level",
    );
    connection.sqlite.close();
  });
  it("uses the same streak object for deliberate-rest qualification and consistency XP", () => {
    const { connection, game, ownerId } = setup();
    connection.sqlite
      .prepare(
        "INSERT INTO daily_check_in(id,owner_id,local_date,capacity,created_at,updated_at,version) VALUES ('rest-day',?,'2026-09-08','low',?,?,1)",
      )
      .run(ownerId, now, now);
    const streak = game.streak(ownerId, "2026-09-08");
    expect(streak).toMatchObject({ current: 1, longest: 1 });

    const attributeId = game.characterSheet(ownerId).attributes[0]!.id;
    const mission = game.createMission(
      ownerId,
      "2026-09-09",
      {
        title: "Continue after rest",
        doneCondition: "Done",
        kind: "progress",
        size: "small",
        attributeIds: [attributeId],
        questId: null,
        chapterId: null,
        repeatFamilyKey: "streak-agreement",
      },
      now,
    );
    game.updateMission(ownerId, mission.id, { status: "accepted" }, now);
    game.completeMission(ownerId, mission.id, undefined, now);
    const breakdown = JSON.parse(
      connection.sqlite
        .prepare(
          "SELECT breakdown_json FROM attribute_xp_award WHERE mission_id=? LIMIT 1",
        )
        .pluck()
        .get(mission.id) as string,
    ) as { consistencyPercent: number };
    expect(breakdown.consistencyPercent).toBe(consistencyPercent(streak));
    expect(game.streak(ownerId, "2026-09-09")).toMatchObject({
      current: 2,
      longest: 2,
    });
    connection.sqlite.close();
  });
  it("classifies every arc day without treating an unfinished today as broken", () => {
    const { connection, game, ownerId } = setup();
    const attributeId = game.characterSheet(ownerId).attributes[0]!.id;
    const mission = game.createMission(
      ownerId,
      "2026-09-02",
      {
        title: "Day two evidence",
        doneCondition: "Done",
        kind: "progress",
        size: "small",
        attributeIds: [attributeId],
        questId: null,
        chapterId: null,
        repeatFamilyKey: "arc-day",
      },
      now,
    );
    game.updateMission(ownerId, mission.id, { status: "accepted" }, now);
    game.completeMission(ownerId, mission.id, undefined, now);
    connection.sqlite
      .prepare(
        "INSERT INTO daily_check_in(id,owner_id,local_date,capacity,created_at,updated_at,version) VALUES ('arc-rest',?,'2026-09-03','low',?,?,1)",
      )
      .run(ownerId, now, now);

    expect(game.arcDays(ownerId, "2026-09-05").slice(0, 6)).toEqual([
      {
        localDate: "2026-09-01",
        dayNumber: 1,
        status: "broken",
        isToday: false,
      },
      {
        localDate: "2026-09-02",
        dayNumber: 2,
        status: "completed",
        isToday: false,
      },
      {
        localDate: "2026-09-03",
        dayNumber: 3,
        status: "deliberate-rest",
        isToday: false,
      },
      {
        localDate: "2026-09-04",
        dayNumber: 4,
        status: "broken",
        isToday: false,
      },
      {
        localDate: "2026-09-05",
        dayNumber: 5,
        status: "future",
        isToday: true,
      },
      {
        localDate: "2026-09-06",
        dayNumber: 6,
        status: "future",
        isToday: false,
      },
    ]);
    expect(game.arcDays(ownerId, "2026-09-05")).toHaveLength(31);
    connection.sqlite.close();
  });
  it("completes an arc with a chronicle outcome, achievement, and next-arc offer", () => {
    const { connection, game, ownerId } = setup();
    const existing = game.listChapters(ownerId, "2026-09-23")[0]!;
    expect(existing).toMatchObject({
      lengthDays: 31,
      dayCounter: { day: 23, of: 31 },
      offerNextArc: false,
    });

    const completed = game.updateChapter(
      ownerId,
      existing.id,
      { status: "completed" },
      "2026-09-23T12:00:00.000Z",
    );
    expect(completed).toMatchObject({
      status: "completed",
      offerNextArc: true,
    });
    expect(game.getChapter(ownerId, existing.id, "2026-09-24")).toMatchObject({
      offerNextArc: true,
    });
    expect(
      game
        .listChapters(ownerId, "2026-09-24")
        .find(({ id }) => id === existing.id),
    ).toMatchObject({ offerNextArc: true });
    expect(game.programSummary(ownerId, "2026-09-24").arc).toMatchObject({
      id: existing.id,
      offerNextArc: true,
    });
    expect(
      connection.sqlite
        .prepare(
          "SELECT outcome FROM chapter_outcome WHERE owner_id=? AND chapter_id=?",
        )
        .get(ownerId, existing.id),
    ).toEqual({ outcome: "completed" });
    expect(
      connection.sqlite
        .prepare(
          "SELECT count(*) FROM achievement_unlock WHERE owner_id=? AND achievement_key='arc_completed'",
        )
        .pluck()
        .get(ownerId),
    ).toBe(1);

    const defaultArc = game.createChapter(
      ownerId,
      {
        title: "Default arc",
        intent: "Use the standard length",
        startDate: "2026-10-02",
        status: "draft",
      },
      now,
    );
    expect(defaultArc).toMatchObject({
      endDate: "2026-12-06",
      lengthDays: 66,
      dayCounter: { day: 1, of: 66 },
    });
    expect(game.getChapter(ownerId, existing.id, "2026-10-02")).toMatchObject({
      offerNextArc: false,
    });
    const resized = game.updateChapter(
      ownerId,
      defaultArc.id,
      { endDate: "2026-10-10" },
      "2026-10-05T12:00:00.000Z",
    );
    expect(resized).toMatchObject({
      endDate: "2026-10-10",
      lengthDays: 9,
      dayCounter: { day: 4, of: 9 },
    });
    expect(game.getChapter(ownerId, defaultArc.id, "2026-10-06")).toMatchObject(
      {
        lengthDays: 9,
        dayCounter: { day: 5, of: 9 },
      },
    );
    expect(() =>
      game.createChapter(
        ownerId,
        {
          title: "Contradictory arc",
          intent: "Reject inconsistent boundaries",
          startDate: "2027-01-01",
          endDate: "2027-01-10",
          lengthDays: 66,
          status: "draft",
        },
        now,
      ),
    ).toThrowError("Chapter length must agree with its start and end dates.");
    game.updateChapter(
      ownerId,
      defaultArc.id,
      { status: "abandoned" },
      "2026-10-06T12:00:00.000Z",
    );

    const next = game.createChapter(
      ownerId,
      {
        title: "Next arc",
        intent: "Continue",
        startDate: "2026-10-02",
        lengthDays: 10,
        status: "active",
      },
      now,
    );
    expect(next).toMatchObject({
      endDate: "2026-10-11",
      lengthDays: 10,
      dayCounter: { day: 1, of: 10 },
    });
    const summary = game.programSummary(ownerId, "2026-10-05");
    expect(summary).toMatchObject({
      aspectsTrained: expect.arrayContaining([
        expect.objectContaining({ name: "Custom A" }),
      ]),
      arc: {
        id: next.id,
        lengthDays: 10,
        dayCounter: { day: 4, of: 10 },
      },
      firstWeek: { durationDays: 7 },
    });
    expect(
      game.updateChapter(
        ownerId,
        next.id,
        { status: "completed" },
        "2026-10-11T12:00:00.000Z",
      ).offerNextArc,
    ).toBe(true);
    expect(game.getChapter(ownerId, next.id, "2026-10-12")).toMatchObject({
      offerNextArc: true,
    });
    expect(
      connection.sqlite
        .prepare(
          "SELECT count(*) FROM achievement_unlock WHERE owner_id=? AND achievement_key='arc_completed'",
        )
        .pluck()
        .get(ownerId),
    ).toBe(1);
    expect(
      connection.sqlite
        .prepare("SELECT count(*) FROM chapter_outcome WHERE owner_id=?")
        .pluck()
        .get(ownerId),
    ).toBe(2);
    connection.sqlite.close();
  });
});
