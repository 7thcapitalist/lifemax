import type { GameRepository } from "@/application/ports/game";
import type {
  CreateAcademicInput,
  CreateChapterInput,
  CreateMissionInput,
  CreateRewardInput,
  UpdateAcademicInput,
  UpdateChapterInput,
  UpdateMissionInput,
  UpdateRewardInput,
} from "@/contracts/game";
import {
  assertChapterTransition,
  assertMissionAttributes,
  assertRedeemable,
} from "@/domain/game/invariants";
import {
  alignmentPercent,
  applyDailyCap,
  applyXp,
  coinAward,
  computeMissionXp,
  POLICY_VERSION,
  splitXp,
} from "@/domain/game/policy";
import { DomainError } from "@/domain/shared/errors";
import { newId } from "@/domain/shared/id";
import type {
  AcademicEntryView,
  AchievementView,
  ChapterProgressView,
  DailyPlanResponse,
  GameMasterContext,
  MissionCompletionResponse,
  MissionProposal,
  MissionView,
  QuestProgressView,
  RewardRedemptionView,
  RewardView,
} from "@/lib/game-types";
import type { DatabaseConnection } from "./client";

const previousDate = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

export class SqliteGameRepositories implements GameRepository {
  constructor(private readonly connection: DatabaseConnection) {}
  private attributes(ownerId: string, missionId: string): string[] {
    return this.connection.sqlite
      .prepare(
        "SELECT aspect_id FROM mission_attribute WHERE owner_id=? AND mission_id=? ORDER BY aspect_id",
      )
      .pluck()
      .all(ownerId, missionId) as string[];
  }
  private mission(ownerId: string, id: string): MissionView {
    const row = this.connection.sqlite
      .prepare(
        `SELECT id,local_date localDate,title,done_condition doneCondition,kind,size,status,source,quest_id questId,chapter_id chapterId,rationale,version FROM mission WHERE owner_id=? AND id=?`,
      )
      .get(ownerId, id) as Omit<MissionView, "attributeIds"> | undefined;
    if (!row) throw new DomainError("MISSION_NOT_FOUND", "Mission not found.");
    return { ...row, attributeIds: this.attributes(ownerId, id) };
  }
  characterSheet(ownerId: string) {
    const character = this.connection.sqlite
      .prepare("SELECT id FROM character WHERE owner_id=?")
      .get(ownerId) as { id: string } | undefined;
    if (!character)
      throw new DomainError("CHARACTER_NOT_FOUND", "Character not found.");
    const attributes = (
      this.connection.sqlite
        .prepare(
          `SELECT a.id,a.name,a.emphasis,a.sort_order sortOrder,p.level,p.xp_into_level xpIntoLevel FROM character_aspect a JOIN attribute_progress p ON p.owner_id=a.owner_id AND p.aspect_id=a.id WHERE a.owner_id=? AND a.archived_at IS NULL ORDER BY a.sort_order,a.id`,
        )
        .all(ownerId) as Array<{
        id: string;
        name: string;
        emphasis: "active" | "maintenance" | "dormant";
        sortOrder: number;
        level: number;
        xpIntoLevel: number;
      }>
    ).map((a) => ({ ...a, xpForNextLevel: 100 * a.level }));
    const coinBalance = this.connection.sqlite
      .prepare(
        "SELECT coalesce(sum(delta),0) FROM coin_ledger WHERE owner_id=?",
      )
      .pluck()
      .get(ownerId) as number;
    const activeQuest = this.connection.sqlite
      .prepare(
        "SELECT id,title,progress_current progressCurrent,progress_target progressTarget FROM quest WHERE owner_id=? AND status='accepted' ORDER BY local_date,id LIMIT 1",
      )
      .get(ownerId) as
      | {
          id: string;
          title: string;
          progressCurrent: number;
          progressTarget: number;
        }
      | undefined;
    const counts = this.connection.sqlite
      .prepare(
        "SELECT (SELECT count(*) FROM achievement_definition) total,(SELECT count(*) FROM achievement_unlock WHERE owner_id=?) unlocked",
      )
      .get(ownerId) as { total: number; unlocked: number };
    return {
      character,
      attributes,
      wallet: { coinBalance },
      activeQuest: activeQuest ?? null,
      achievements: counts,
    };
  }
  gameMasterContext(
    ownerId: string,
    localDate: string,
    capacityOverride?: "low" | "normal" | "high",
  ): GameMasterContext {
    const owner = this.connection.sqlite
      .prepare(
        "SELECT becoming_statement becomingStatement FROM owner WHERE id=?",
      )
      .get(ownerId) as { becomingStatement: string };
    const attrs = this.connection.sqlite
      .prepare(
        "SELECT id,name,emphasis,sort_order sortOrder FROM character_aspect WHERE owner_id=? AND archived_at IS NULL ORDER BY sort_order,id",
      )
      .all(ownerId) as Array<{
      id: string;
      name: string;
      emphasis: "active" | "maintenance" | "dormant";
      sortOrder: number;
    }>;
    const chapter = this.connection.sqlite
      .prepare(
        "SELECT id,title FROM chapter WHERE owner_id=? AND status='active' LIMIT 1",
      )
      .get(ownerId) as { id: string; title: string } | undefined;
    const guards = this.connection.sqlite
      .prepare(
        "SELECT id,category,statement FROM balance_guardrail WHERE owner_id=? AND status='active' ORDER BY id",
      )
      .all(ownerId) as Array<{
      id: string;
      category: string;
      statement: string;
    }>;
    const recent = this.connection.sqlite
      .prepare(
        `SELECT m.local_date localDate,m.kind,1 completed,group_concat(ma.aspect_id) ids FROM mission m LEFT JOIN mission_attribute ma ON ma.owner_id=m.owner_id AND ma.mission_id=m.id WHERE m.owner_id=? AND m.status='completed' AND m.local_date>=date(?,'-7 day') GROUP BY m.id ORDER BY m.local_date`,
      )
      .all(ownerId, localDate) as Array<{
      localDate: string;
      kind: MissionView["kind"];
      completed: number;
      ids: string | null;
    }>;
    const check = this.connection.sqlite
      .prepare(
        "SELECT capacity,reflection FROM daily_check_in WHERE owner_id=? AND local_date=?",
      )
      .get(ownerId, localDate) as
      | { capacity: "low" | "normal" | "high"; reflection: string | null }
      | undefined;
    const known = <T>(value: T) => ({ status: "known" as const, value });
    const unknown = () => ({ status: "unknown" as const, value: null });
    return {
      ownerLocalDate: localDate,
      becomingStatement: owner.becomingStatement
        ? known(owner.becomingStatement)
        : unknown(),
      attributes: attrs.length ? known(attrs) : unknown(),
      activeChapter: chapter ? known(chapter) : unknown(),
      activeGuardrails: guards.length ? known(guards) : unknown(),
      recentActivity: recent.length
        ? known(
            recent.map((r) => ({
              localDate: r.localDate,
              kind: r.kind,
              completed: true,
              attributeIds: r.ids?.split(",") ?? [],
            })),
          )
        : unknown(),
      todayCheckIn: capacityOverride
        ? known({ capacity: capacityOverride, reflection: null })
        : check
          ? known(check)
          : unknown(),
    };
  }
  savePlan(
    ownerId: string,
    localDate: string,
    now: string,
    generated: {
      planFingerprint: string;
      generatorVersion: string;
      proposals: MissionProposal[];
    },
    context: GameMasterContext,
  ): DailyPlanResponse {
    return this.connection.sqlite.transaction(() => {
      const existing = this.connection.sqlite
        .prepare(
          "SELECT id FROM mission_plan WHERE owner_id=? AND local_date=? AND input_fingerprint=? AND generator_version=?",
        )
        .get(
          ownerId,
          localDate,
          generated.planFingerprint,
          generated.generatorVersion,
        ) as { id: string } | undefined;
      if (existing)
        return {
          id: existing.id,
          localDate,
          planFingerprint: generated.planFingerprint,
          generatorVersion: generated.generatorVersion,
          context,
          proposals: generated.proposals,
        };
      const id = newId();
      this.connection.sqlite
        .prepare(
          "INSERT INTO mission_plan(id,owner_id,local_date,input_fingerprint,generator_version,generated_at) VALUES (?,?,?,?,?,?)",
        )
        .run(
          id,
          ownerId,
          localDate,
          generated.planFingerprint,
          generated.generatorVersion,
          now,
        );
      for (const p of generated.proposals) {
        const missionId = newId();
        this.connection.sqlite
          .prepare(
            `INSERT INTO mission(id,owner_id,local_date,title,done_condition,kind,size,status,source,plan_id,quest_id,chapter_id,rationale,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,'proposed','generator',?,?,?,?,?,?,1)`,
          )
          .run(
            missionId,
            ownerId,
            localDate,
            p.title,
            p.doneCondition,
            p.kind,
            p.size,
            id,
            p.questId,
            p.chapterId,
            p.rationale,
            now,
            now,
          );
        for (const a of p.attributeIds)
          this.connection.sqlite
            .prepare(
              "INSERT INTO mission_attribute(owner_id,mission_id,aspect_id) VALUES (?,?,?)",
            )
            .run(ownerId, missionId, a);
      }
      return {
        id,
        localDate,
        planFingerprint: generated.planFingerprint,
        generatorVersion: generated.generatorVersion,
        context,
        proposals: generated.proposals,
      };
    })();
  }
  listMissions(ownerId: string, localDate: string) {
    return (
      this.connection.sqlite
        .prepare(
          `SELECT id FROM mission WHERE owner_id=? AND local_date=? ORDER BY created_at,id`,
        )
        .pluck()
        .all(ownerId, localDate) as string[]
    ).map((id) => this.mission(ownerId, id));
  }
  createMission(
    ownerId: string,
    localDate: string,
    input: CreateMissionInput,
    now: string,
  ) {
    const id = newId();
    return this.connection.sqlite.transaction(() => {
      assertMissionAttributes(input.kind, input.attributeIds);
      for (const a of input.attributeIds) {
        if (
          !this.connection.sqlite
            .prepare(
              "SELECT 1 FROM character_aspect WHERE owner_id=? AND id=? AND archived_at IS NULL",
            )
            .get(ownerId, a)
        )
          throw new DomainError("ATTRIBUTE_NOT_FOUND", "Attribute not found.");
      }
      this.connection.sqlite
        .prepare(
          `INSERT INTO mission(id,owner_id,local_date,title,done_condition,kind,size,status,source,quest_id,chapter_id,repeat_family_key,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,'proposed','owner',?,?,?,?,?,1)`,
        )
        .run(
          id,
          ownerId,
          localDate,
          input.title,
          input.doneCondition,
          input.kind,
          input.size,
          input.questId ?? null,
          input.chapterId ?? null,
          input.repeatFamilyKey ?? null,
          now,
          now,
        );
      for (const a of input.attributeIds)
        this.connection.sqlite
          .prepare(
            "INSERT INTO mission_attribute(owner_id,mission_id,aspect_id) VALUES (?,?,?)",
          )
          .run(ownerId, id, a);
      return this.mission(ownerId, id);
    })();
  }
  updateMission(
    ownerId: string,
    id: string,
    input: UpdateMissionInput,
    now: string,
  ) {
    return this.connection.sqlite.transaction(() => {
      const current = this.mission(ownerId, id);
      if (current.status !== "proposed")
        throw new DomainError(
          "MISSION_NOT_EDITABLE",
          "Only proposed missions can be edited.",
        );
      const finalKind = input.kind ?? current.kind;
      const finalAttributeIds = input.attributeIds ?? current.attributeIds;
      assertMissionAttributes(finalKind, finalAttributeIds);
      if (input.attributeIds) {
        for (const a of input.attributeIds) {
          if (
            !this.connection.sqlite
              .prepare(
                "SELECT 1 FROM character_aspect WHERE owner_id=? AND id=? AND archived_at IS NULL",
              )
              .get(ownerId, a)
          )
            throw new DomainError(
              "ATTRIBUTE_NOT_FOUND",
              "Attribute not found.",
            );
        }
        this.connection.sqlite
          .prepare(
            "DELETE FROM mission_attribute WHERE owner_id=? AND mission_id=?",
          )
          .run(ownerId, id);
        for (const a of input.attributeIds)
          this.connection.sqlite
            .prepare(
              "INSERT INTO mission_attribute(owner_id,mission_id,aspect_id) VALUES (?,?,?)",
            )
            .run(ownerId, id, a);
      }
      this.connection.sqlite
        .prepare(
          `UPDATE mission SET title=?,done_condition=?,kind=?,size=?,quest_id=?,chapter_id=?,status=?,accepted_size=?,accepted_stretch=?,accepted_at=?,updated_at=?,version=version+1 WHERE owner_id=? AND id=?`,
        )
        .run(
          input.title ?? current.title,
          input.doneCondition ?? current.doneCondition,
          input.kind ?? current.kind,
          input.size ?? current.size,
          input.questId === undefined ? current.questId : input.questId,
          input.chapterId === undefined ? current.chapterId : input.chapterId,
          input.status ?? current.status,
          input.status === "accepted" ? (input.size ?? current.size) : null,
          input.acceptedStretch ? 1 : 0,
          input.status === "accepted" ? now : null,
          now,
          ownerId,
          id,
        );
      return this.mission(ownerId, id);
    })();
  }
  completeMission(
    ownerId: string,
    id: string,
    idempotencyKey: string | undefined,
    now: string,
  ): MissionCompletionResponse {
    return this.connection.sqlite.transaction(() => {
      const row = this.connection.sqlite
        .prepare(
          `SELECT id,local_date localDate,title,kind,accepted_size acceptedSize,accepted_stretch acceptedStretch,repeat_family_key repeatFamilyKey,quest_id questId,chapter_id chapterId,status FROM mission WHERE owner_id=? AND id=?`,
        )
        .get(ownerId, id) as
        | {
            id: string;
            localDate: string;
            title: string;
            kind: MissionView["kind"];
            acceptedSize: "small" | "standard" | "major" | null;
            acceptedStretch: number;
            repeatFamilyKey: string | null;
            questId: string | null;
            chapterId: string | null;
            status: string;
          }
        | undefined;
      if (!row)
        throw new DomainError("MISSION_NOT_FOUND", "Mission not found.");
      if (row.status === "completed")
        throw new DomainError(
          "MISSION_ALREADY_COMPLETED",
          "Mission was already completed.",
        );
      if (row.status !== "accepted" || !row.acceptedSize)
        throw new DomainError(
          "MISSION_NOT_COMPLETABLE",
          "Only accepted missions can be completed.",
        );
      const links = this.connection.sqlite
        .prepare(
          `SELECT a.id,a.emphasis,p.level,p.xp_into_level xpIntoLevel FROM mission_attribute ma JOIN character_aspect a ON a.owner_id=ma.owner_id AND a.id=ma.aspect_id JOIN attribute_progress p ON p.owner_id=a.owner_id AND p.aspect_id=a.id WHERE ma.owner_id=? AND ma.mission_id=? ORDER BY a.sort_order,a.id`,
        )
        .all(ownerId, id) as Array<{
        id: string;
        emphasis: "active" | "maintenance" | "dormant";
        level: number;
        xpIntoLevel: number;
      }>;
      assertMissionAttributes(
        row.kind,
        links.map((link) => link.id),
      );
      const family =
        row.repeatFamilyKey ??
        `${row.title.trim().toLowerCase().replace(/\s+/g, " ")}|${links
          .map((a) => a.id)
          .sort()
          .join(",")}`;
      const prior = this.connection.sqlite
        .prepare(
          `SELECT count(*) FROM mission WHERE owner_id=? AND local_date=? AND status='completed' AND coalesce(repeat_family_key,lower(trim(title))||'|'||(SELECT group_concat(aspect_id,',') FROM (SELECT aspect_id FROM mission_attribute WHERE owner_id=mission.owner_id AND mission_id=mission.id ORDER BY aspect_id)))=?`,
        )
        .pluck()
        .get(ownerId, row.localDate, family) as number;
      let consecutive = 0;
      for (let day = 1; day <= 5; day++) {
        const found = this.connection.sqlite
          .prepare(
            `SELECT 1 FROM mission m JOIN mission_attribute ma ON ma.owner_id=m.owner_id AND ma.mission_id=m.id WHERE m.owner_id=? AND m.status='completed' AND m.local_date=? AND ma.aspect_id IN (${links.map(() => "?").join(",") || "NULL"}) LIMIT 1`,
          )
          .get(
            ownerId,
            previousDate(row.localDate, day),
            ...links.map((a) => a.id),
          );
        if (!found) break;
        consecutive++;
      }
      const linkedToActiveChapterOrQuest = Boolean(
        this.connection.sqlite
          .prepare(
            `SELECT 1 WHERE EXISTS(SELECT 1 FROM chapter WHERE owner_id=? AND id=? AND status='active') OR EXISTS(SELECT 1 FROM quest WHERE owner_id=? AND id=? AND status='accepted')`,
          )
          .get(ownerId, row.chapterId, ownerId, row.questId),
      );
      const aligned = alignmentPercent({
        linkedToActiveChapterOrQuest,
        anyActive: links.some((a) => a.emphasis === "active"),
        allDormant:
          links.length > 0 && links.every((a) => a.emphasis === "dormant"),
      });
      const computed = computeMissionXp({
        size: row.acceptedSize,
        priorSameFamily: prior,
        stretch: Boolean(row.acceptedStretch),
        alignmentPercent: aligned,
        consecutivePriorDays: consecutive,
      });
      const already = this.connection.sqlite
        .prepare(
          "SELECT coalesce(sum(points),0) FROM attribute_xp_award WHERE owner_id=? AND local_date=?",
        )
        .pluck()
        .get(ownerId, row.localDate) as number;
      const split = splitXp(
        applyDailyCap(computed.total, already),
        links.map((a) => a.id),
      );
      const awards: MissionCompletionResponse["xpAwards"] = [];
      for (const part of split) {
        const current = links.find((a) => a.id === part.aspectId)!;
        const next = applyXp(current.level, current.xpIntoLevel, part.points);
        this.connection.sqlite
          .prepare(
            "INSERT INTO attribute_xp_award(id,owner_id,mission_id,aspect_id,points,policy_version,breakdown_json,local_date,awarded_at) VALUES (?,?,?,?,?,?,?,?,?)",
          )
          .run(
            newId(),
            ownerId,
            id,
            part.aspectId,
            part.points,
            POLICY_VERSION,
            JSON.stringify({
              ...computed.breakdown,
              dailyCap: 200,
              awardedBefore: already,
              awarded: split.reduce((n, p) => n + p.points, 0),
            }),
            row.localDate,
            now,
          );
        this.connection.sqlite
          .prepare(
            "UPDATE attribute_progress SET level=?,xp_into_level=?,total_xp=total_xp+?,policy_version=?,updated_at=?,version=version+1 WHERE owner_id=? AND aspect_id=?",
          )
          .run(
            next.level,
            next.xpIntoLevel,
            part.points,
            POLICY_VERSION,
            now,
            ownerId,
            part.aspectId,
          );
        awards.push({
          attributeId: part.aspectId,
          points: part.points,
          level: next.level,
          xpIntoLevel: next.xpIntoLevel,
        });
      }
      const coins = coinAward(row.acceptedSize);
      this.connection.sqlite
        .prepare(
          "INSERT INTO coin_ledger(id,owner_id,entry_type,delta,reason,mission_id,local_date,created_at) VALUES (?,?,'award',?,'mission completion',?,?,?)",
        )
        .run(newId(), ownerId, coins, id, row.localDate, now);
      let questProgress: null | { current: number; target: number } = null;
      if (row.questId) {
        this.connection.sqlite
          .prepare(
            "UPDATE quest SET progress_current=min(progress_current+1,progress_target),updated_at=?,version=version+1 WHERE owner_id=? AND id=?",
          )
          .run(now, ownerId, row.questId);
        questProgress = this.connection.sqlite
          .prepare(
            "SELECT progress_current current,progress_target target FROM quest WHERE owner_id=? AND id=?",
          )
          .get(ownerId, row.questId) as { current: number; target: number };
        const quest = this.connection.sqlite
          .prepare(
            "SELECT status,accepted_size acceptedSize FROM quest WHERE owner_id=? AND id=?",
          )
          .get(ownerId, row.questId) as {
          status: string;
          acceptedSize: string | null;
        };
        if (
          quest.status === "accepted" &&
          questProgress.current >= questProgress.target
        )
          this.connection.sqlite
            .prepare(
              "INSERT INTO quest_outcome(id,quest_id,owner_id,outcome,occurred_at,accepted_size) VALUES (?,?,?,'completed',?,?)",
            )
            .run(newId(), row.questId, ownerId, now, quest.acceptedSize);
      }
      this.connection.sqlite
        .prepare(
          "UPDATE mission SET status='completed',completed_at=?,idempotency_key=coalesce(?,idempotency_key),updated_at=?,version=version+1 WHERE owner_id=? AND id=?",
        )
        .run(now, idempotencyKey ?? null, now, ownerId, id);
      const unlocked: string[] = [];
      const unlock = (key: string) => {
        const result = this.connection.sqlite
          .prepare(
            "INSERT INTO achievement_unlock(id,owner_id,achievement_key,mission_id,unlocked_at) VALUES (?,?,?,?,?) ON CONFLICT(owner_id,achievement_key) DO NOTHING",
          )
          .run(newId(), ownerId, key, id, now);
        if (result.changes) unlocked.push(key);
      };
      unlock("first_mission");
      if (
        awards.some(
          (award) =>
            award.level >
            links.find((link) => link.id === award.attributeId)!.level,
        )
      )
        unlock("first_attribute_level");
      const days = this.connection.sqlite
        .prepare(
          "SELECT count(DISTINCT local_date) FROM mission WHERE owner_id=? AND (status='completed' OR id=?)",
        )
        .pluck()
        .get(ownerId, id) as number;
      if (days >= 7) unlock("seven_completion_days");
      const balance = this.connection.sqlite
        .prepare(
          "SELECT coalesce(sum(delta),0) FROM coin_ledger WHERE owner_id=?",
        )
        .pluck()
        .get(ownerId) as number;
      const chapterProgress = row.chapterId
        ? this.chapterProgress(ownerId, row.chapterId)
        : null;
      return {
        mission: this.mission(ownerId, id),
        xpAwards: awards,
        coinAward: coins,
        coinBalance: balance,
        questProgress,
        chapterProgress,
        newlyUnlockedAchievements: unlocked,
      };
    })();
  }
  listQuests(ownerId: string, localDate?: string): QuestProgressView[] {
    return this.connection.sqlite
      .prepare(
        `SELECT id,local_date localDate,title,done_condition doneCondition,reason,size,source,status,role,milestone_id milestoneId,progress_current progressCurrent,progress_target progressTarget,version FROM quest WHERE owner_id=? ${localDate ? "AND local_date=?" : ""} ORDER BY local_date,id`,
      )
      .all(
        ...(localDate ? [ownerId, localDate] : [ownerId]),
      ) as QuestProgressView[];
  }
  private chapterProgress(ownerId: string, id: string) {
    const row = this.connection.sqlite
      .prepare(
        `SELECT count(*) target,sum(completed) current FROM (
          SELECT q.id item_id,CASE WHEN q.status='completed' THEN 1 ELSE 0 END completed
          FROM quest q WHERE q.owner_id=? AND q.milestone_id IN (SELECT id FROM milestone WHERE owner_id=? AND chapter_id=?)
          UNION ALL
          SELECT m.id item_id,CASE WHEN m.status='completed' THEN 1 ELSE 0 END completed
          FROM mission m WHERE m.owner_id=? AND m.chapter_id=? AND m.quest_id IS NULL
        )`,
      )
      .get(ownerId, ownerId, id, ownerId, id) as {
      current: number | null;
      target: number;
    };
    return { current: row.current ?? 0, target: Math.max(1, row.target) };
  }
  private chapter(ownerId: string, id: string): ChapterProgressView {
    const row = this.connection.sqlite
      .prepare(
        "SELECT id,title,intent,start_date startDate,end_date endDate,status,version FROM chapter WHERE owner_id=? AND id=?",
      )
      .get(ownerId, id) as
      | {
          id: string;
          title: string;
          intent: string;
          startDate: string;
          endDate: string;
          status: ChapterProgressView["status"];
          version: number;
        }
      | undefined;
    if (!row) throw new DomainError("CHAPTER_NOT_FOUND", "Chapter not found.");
    return { ...row, ...this.chapterProgress(ownerId, id) };
  }
  listChapters(ownerId: string) {
    return (
      this.connection.sqlite
        .prepare(
          "SELECT id FROM chapter WHERE owner_id=? ORDER BY start_date,id",
        )
        .pluck()
        .all(ownerId) as string[]
    ).map((id) => this.chapter(ownerId, id));
  }
  getChapter(ownerId: string, id: string) {
    return this.chapter(ownerId, id);
  }
  createChapter(ownerId: string, input: CreateChapterInput, now: string) {
    if (input.endDate < input.startDate)
      throw new DomainError(
        "CHAPTER_DATES",
        "Chapter end date must not precede start date.",
      );
    const id = newId();
    try {
      this.connection.sqlite
        .prepare(
          "INSERT INTO chapter(id,owner_id,title,intent,start_date,end_date,status,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,1)",
        )
        .run(
          id,
          ownerId,
          input.title,
          input.intent,
          input.startDate,
          input.endDate,
          input.status,
          now,
          now,
        );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("one_active_chapter")
      )
        throw new DomainError(
          "ACTIVE_CHAPTER_EXISTS",
          "An active chapter already exists.",
        );
      throw error;
    }
    return this.chapter(ownerId, id);
  }
  updateChapter(
    ownerId: string,
    id: string,
    input: UpdateChapterInput,
    now: string,
  ) {
    const current = this.chapter(ownerId, id);
    const status = input.status ?? current.status;
    assertChapterTransition(current.status, status);
    const start = input.startDate ?? current.startDate,
      end = input.endDate ?? current.endDate;
    if (end < start)
      throw new DomainError(
        "CHAPTER_DATES",
        "Chapter end date must not precede start date.",
      );
    try {
      this.connection.sqlite
        .prepare(
          "UPDATE chapter SET title=?,intent=?,start_date=?,end_date=?,status=?,updated_at=?,version=version+1 WHERE owner_id=? AND id=?",
        )
        .run(
          input.title ?? current.title,
          input.intent ?? current.intent,
          start,
          end,
          status,
          now,
          ownerId,
          id,
        );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("one_active_chapter")
      )
        throw new DomainError(
          "ACTIVE_CHAPTER_EXISTS",
          "An active chapter already exists.",
        );
      throw error;
    }
    return this.chapter(ownerId, id);
  }
  listAchievements(ownerId: string): AchievementView[] {
    return this.connection.sqlite
      .prepare(
        `SELECT d.key,d.title,d.description,u.unlocked_at unlockedAt FROM achievement_definition d LEFT JOIN achievement_unlock u ON u.achievement_key=d.key AND u.owner_id=? ORDER BY d.key`,
      )
      .all(ownerId) as AchievementView[];
  }
  private reward(ownerId: string, id: string) {
    const row = this.connection.sqlite
      .prepare(
        "SELECT id,title,description,coin_cost coinCost,status,version FROM reward WHERE owner_id=? AND id=?",
      )
      .get(ownerId, id) as RewardView | undefined;
    if (!row) throw new DomainError("REWARD_NOT_FOUND", "Reward not found.");
    return row;
  }
  listRewards(ownerId: string) {
    return this.connection.sqlite
      .prepare(
        "SELECT id,title,description,coin_cost coinCost,status,version FROM reward WHERE owner_id=? ORDER BY created_at,id",
      )
      .all(ownerId) as RewardView[];
  }
  createReward(ownerId: string, input: CreateRewardInput, now: string) {
    const id = newId();
    this.connection.sqlite
      .prepare(
        "INSERT INTO reward(id,owner_id,title,description,coin_cost,status,created_at,updated_at,version) VALUES (?,?,?,?,?,'active',?,?,1)",
      )
      .run(
        id,
        ownerId,
        input.title,
        input.description ?? null,
        input.coinCost,
        now,
        now,
      );
    return this.reward(ownerId, id);
  }
  updateReward(
    ownerId: string,
    id: string,
    input: UpdateRewardInput,
    now: string,
  ) {
    const r = this.reward(ownerId, id);
    this.connection.sqlite
      .prepare(
        "UPDATE reward SET title=?,description=?,coin_cost=?,status=?,updated_at=?,version=version+1 WHERE owner_id=? AND id=?",
      )
      .run(
        input.title ?? r.title,
        input.description === undefined ? r.description : input.description,
        input.coinCost ?? r.coinCost,
        input.status ?? r.status,
        now,
        ownerId,
        id,
      );
    return this.reward(ownerId, id);
  }
  redeemReward(
    ownerId: string,
    id: string,
    localDate: string,
    now: string,
  ): RewardRedemptionView {
    return this.connection.sqlite.transaction(() => {
      const reward = this.reward(ownerId, id);
      if (reward.status !== "active")
        throw new DomainError(
          "REWARD_ARCHIVED",
          "Archived rewards cannot be redeemed.",
        );
      const balance = this.connection.sqlite
        .prepare(
          "SELECT coalesce(sum(delta),0) FROM coin_ledger WHERE owner_id=?",
        )
        .pluck()
        .get(ownerId) as number;
      assertRedeemable(balance, reward.coinCost);
      const redemptionId = newId();
      this.connection.sqlite
        .prepare(
          "INSERT INTO reward_redemption(id,owner_id,reward_id,coin_cost,title,local_date,redeemed_at) VALUES (?,?,?,?,?,?,?)",
        )
        .run(
          redemptionId,
          ownerId,
          id,
          reward.coinCost,
          reward.title,
          localDate,
          now,
        );
      this.connection.sqlite
        .prepare(
          "INSERT INTO coin_ledger(id,owner_id,entry_type,delta,reason,redemption_id,local_date,created_at) VALUES (?,?,'redeem',?,'reward redemption',?,?,?)",
        )
        .run(newId(), ownerId, -reward.coinCost, redemptionId, localDate, now);
      return {
        id: redemptionId,
        rewardId: id,
        title: reward.title,
        coinCost: reward.coinCost,
        coinBalance: balance - reward.coinCost,
        localDate,
        redeemedAt: now,
      };
    })();
  }
  private academic(ownerId: string, id: string) {
    const row = this.connection.sqlite
      .prepare(
        "SELECT id,kind,title,course,term,due_date dueDate,status,score_value scoreValue,score_scale scoreScale,notes,version FROM academic_entry WHERE owner_id=? AND id=?",
      )
      .get(ownerId, id) as AcademicEntryView | undefined;
    if (!row)
      throw new DomainError("ACADEMIC_NOT_FOUND", "Academic entry not found.");
    return row;
  }
  listAcademics(ownerId: string) {
    return this.connection.sqlite
      .prepare(
        "SELECT id,kind,title,course,term,due_date dueDate,status,score_value scoreValue,score_scale scoreScale,notes,version FROM academic_entry WHERE owner_id=? ORDER BY created_at,id",
      )
      .all(ownerId) as AcademicEntryView[];
  }
  getAcademic(ownerId: string, id: string) {
    return this.academic(ownerId, id);
  }
  createAcademic(ownerId: string, input: CreateAcademicInput, now: string) {
    const id = newId();
    this.connection.sqlite
      .prepare(
        "INSERT INTO academic_entry(id,owner_id,kind,title,course,term,due_date,status,score_value,score_scale,notes,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)",
      )
      .run(
        id,
        ownerId,
        input.kind,
        input.title,
        input.course ?? null,
        input.term ?? null,
        input.dueDate ?? null,
        input.status ?? null,
        input.scoreValue ?? null,
        input.scoreScale ?? null,
        input.notes ?? null,
        now,
        now,
      );
    return this.academic(ownerId, id);
  }
  updateAcademic(
    ownerId: string,
    id: string,
    input: UpdateAcademicInput,
    now: string,
  ) {
    const a = this.academic(ownerId, id);
    this.connection.sqlite
      .prepare(
        "UPDATE academic_entry SET kind=?,title=?,course=?,term=?,due_date=?,status=?,score_value=?,score_scale=?,notes=?,updated_at=?,version=version+1 WHERE owner_id=? AND id=?",
      )
      .run(
        input.kind ?? a.kind,
        input.title ?? a.title,
        input.course === undefined ? a.course : input.course,
        input.term === undefined ? a.term : input.term,
        input.dueDate === undefined ? a.dueDate : input.dueDate,
        input.status === undefined ? a.status : input.status,
        input.scoreValue === undefined ? a.scoreValue : input.scoreValue,
        input.scoreScale === undefined ? a.scoreScale : input.scoreScale,
        input.notes === undefined ? a.notes : input.notes,
        now,
        ownerId,
        id,
      );
    return this.academic(ownerId, id);
  }
  deleteAcademic(ownerId: string, id: string) {
    const a = this.academic(ownerId, id);
    if (a.scoreValue !== null)
      throw new DomainError(
        "ACADEMIC_NOT_DELETABLE",
        "Scored academic entries cannot be deleted.",
      );
    this.connection.sqlite
      .prepare("DELETE FROM academic_entry WHERE owner_id=? AND id=?")
      .run(ownerId, id);
  }
}
