import type {
  AspectRecord,
  BriefingRecord,
  ChapterRecord,
  CharacterReadRepository,
  CheckInRecord,
  GuardrailRecord,
  MilestoneRecord,
  NorthStarRecord,
  OwnerRecord,
  OwnerRepository,
  PlanningRepository,
  PrivacyDeletionPort,
  QuestOutcomeRecord,
  QuestRecord,
  SessionRepository,
  StoredSession,
  TransactionPort,
} from "@/application/ports/persistence";
import type { OnboardingInput } from "@/contracts/http";
import type { QuestRole } from "@/domain/planning/invariants";
import { DomainError } from "@/domain/shared/errors";
import { newId } from "@/domain/shared/id";
import type { DatabaseConnection } from "./client";

type QuestRow = {
  id: string;
  localDate: string;
  title: string;
  doneCondition: string;
  reason: string;
  size: "small" | "standard" | "major";
  source: "owner" | "deterministic";
  status: QuestRecord["status"];
  role: QuestRole | null;
  milestoneId: string | null;
  acceptedSize: "small" | "standard" | "major" | null;
  acceptedAt: string | null;
  version: number;
};

export class SqliteRepositories
  implements
    OwnerRepository,
    SessionRepository,
    CharacterReadRepository,
    PlanningRepository,
    TransactionPort,
    PrivacyDeletionPort
{
  readonly owners: OwnerRepository = this;
  readonly sessions: SessionRepository = this;
  readonly character: CharacterReadRepository = this;
  readonly planning: PlanningRepository = this;
  readonly transactions: TransactionPort = this;
  readonly privacy: PrivacyDeletionPort = this;

  constructor(private readonly connection: DatabaseConnection) {}

  run<T>(work: () => T): T {
    return this.connection.sqlite.transaction(work)();
  }

  count(): number {
    return (
      this.connection.sqlite
        .prepare("SELECT count(*) AS value FROM owner")
        .get() as { value: number }
    ).value;
  }

  createWithCredential(input: {
    id: string;
    displayName: string;
    timezone: string;
    passwordHash: string;
    now: string;
  }): void {
    this.connection.sqlite
      .prepare(
        "INSERT INTO owner(id,display_name,timezone,becoming_statement,setup_completed,created_at,updated_at,version) VALUES (?,?,?,'',0,?,?,1)",
      )
      .run(input.id, input.displayName, input.timezone, input.now, input.now);
    this.connection.sqlite
      .prepare(
        "INSERT INTO credential(owner_id,password_hash,changed_at) VALUES (?,?,?)",
      )
      .run(input.id, input.passwordHash, input.now);
  }

  findCredential(): { ownerId: string; passwordHash: string } | undefined {
    return this.connection.sqlite
      .prepare(
        "SELECT o.id AS ownerId, c.password_hash AS passwordHash FROM owner o JOIN credential c ON c.owner_id=o.id LIMIT 1",
      )
      .get() as { ownerId: string; passwordHash: string } | undefined;
  }

  findById(ownerId: string): OwnerRecord | undefined {
    const row = this.connection.sqlite
      .prepare(
        "SELECT id, display_name AS displayName, timezone, becoming_statement AS becomingStatement, setup_completed AS setupCompleted, version FROM owner WHERE id=?",
      )
      .get(ownerId) as
      | (Omit<OwnerRecord, "setupCompleted"> & { setupCompleted: number })
      | undefined;
    return row
      ? { ...row, setupCompleted: row.setupCompleted === 1 }
      : undefined;
  }

  create(input: {
    id: string;
    ownerId: string;
    tokenHash: string;
    csrfHash: string;
    now: string;
    idleExpiresAt: string;
    absoluteExpiresAt: string;
  }): void {
    this.connection.sqlite
      .prepare(
        "INSERT INTO session(id,owner_id,token_hash,csrf_hash,created_at,last_used_at,idle_expires_at,absolute_expires_at) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(
        input.id,
        input.ownerId,
        input.tokenHash,
        input.csrfHash,
        input.now,
        input.now,
        input.idleExpiresAt,
        input.absoluteExpiresAt,
      );
  }

  findByTokenHash(tokenHash: string): StoredSession | undefined {
    return this.connection.sqlite
      .prepare(
        `SELECT id, owner_id AS ownerId, token_hash AS tokenHash, csrf_hash AS csrfHash,
          idle_expires_at AS idleExpiresAt, absolute_expires_at AS absoluteExpiresAt, revoked_at AS revokedAt,
          NULL AS matchedTokenExpiresAt, NULL AS matchedTokenUsesRemaining, 'current' AS tokenMatch
         FROM session WHERE token_hash=?
         UNION ALL
         SELECT s.id, s.owner_id, s.token_hash, s.csrf_hash,
          s.idle_expires_at, s.absolute_expires_at, s.revoked_at,
          h.expires_at, h.uses_remaining, 'prior'
         FROM session_token_history h JOIN session s ON s.id=h.session_id
         WHERE h.token_hash=? LIMIT 1`,
      )
      .get(tokenHash, tokenHash) as StoredSession | undefined;
  }

  rotate(
    id: string,
    expectedTokenHash: string,
    nextTokenHash: string,
    now: string,
    idleExpiresAt: string,
    previousTokenExpiresAt: string,
    previousTokenUses: number,
    maxPriorGenerations: number,
  ): boolean {
    return this.connection.sqlite.transaction(() => {
      const rotated = this.connection.sqlite
        .prepare(
          `UPDATE session SET token_hash=?, token_generation=token_generation+1,
           last_used_at=?, idle_expires_at=?
           WHERE id=? AND token_hash=? AND revoked_at IS NULL`,
        )
        .run(nextTokenHash, now, idleExpiresAt, id, expectedTokenHash).changes;
      if (rotated !== 1) return false;
      this.connection.sqlite
        .prepare(
          `DELETE FROM session_token_history
           WHERE session_id=? AND (
             expires_at<=? OR generation < (SELECT token_generation-? FROM session WHERE id=?)
           )`,
        )
        .run(id, now, maxPriorGenerations, id);
      this.connection.sqlite
        .prepare(
          `INSERT INTO session_token_history(session_id,generation,token_hash,expires_at,uses_remaining)
           SELECT id,token_generation-1,?,?,? FROM session WHERE id=?`,
        )
        .run(expectedTokenHash, previousTokenExpiresAt, previousTokenUses, id);
      return true;
    })();
  }

  usePriorToken(
    id: string,
    tokenHash: string,
    now: string,
    idleExpiresAt: string,
  ): boolean {
    return this.connection.sqlite.transaction(() => {
      const used = this.connection.sqlite
        .prepare(
          `UPDATE session_token_history SET uses_remaining=uses_remaining-1
           WHERE session_id=? AND token_hash=? AND expires_at>? AND uses_remaining>0
             AND EXISTS (SELECT 1 FROM session WHERE id=? AND revoked_at IS NULL
               AND idle_expires_at>? AND absolute_expires_at>?)`,
        )
        .run(id, tokenHash, now, id, now, now).changes;
      if (used !== 1) return false;
      this.connection.sqlite
        .prepare(
          "UPDATE session SET last_used_at=?, idle_expires_at=? WHERE id=?",
        )
        .run(now, idleExpiresAt, id);
      return true;
    })();
  }

  revoke(tokenHash: string, now: string): void {
    this.connection.sqlite
      .prepare(
        `UPDATE session SET revoked_at=? WHERE revoked_at IS NULL AND
         (token_hash=? OR id IN (SELECT session_id FROM session_token_history WHERE token_hash=?))`,
      )
      .run(now, tokenHash, tokenHash);
  }

  deleteOwnerGraph(ownerId: string): boolean {
    return this.connection.deleteOwnerGraph(ownerId);
  }

  completeOnboarding(
    ownerId: string,
    input: OnboardingInput,
    now: string,
  ): void {
    const aspectIds = input.aspects.map(() => newId());
    const insertAspect = this.connection.sqlite.prepare(
      "INSERT INTO character_aspect (id,owner_id,name,definition,desired_identity,emphasis,sort_order,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,1)",
    );
    input.aspects.forEach((aspect, index) =>
      insertAspect.run(
        aspectIds[index],
        ownerId,
        aspect.name,
        aspect.definition,
        aspect.desiredIdentity,
        aspect.emphasis,
        index,
        now,
        now,
      ),
    );
    const insertStar = this.connection.sqlite.prepare(
      "INSERT INTO north_star (id,owner_id,title,motivation,status,created_at,updated_at,version) VALUES (?,?,?,?,'active',?,?,1)",
    );
    input.northStars.forEach((star) =>
      insertStar.run(newId(), ownerId, star.title, star.motivation, now, now),
    );
    const chapterId = newId();
    this.connection.sqlite
      .prepare(
        "INSERT INTO chapter (id,owner_id,title,intent,start_date,end_date,status,created_at,updated_at,version) VALUES (?,?,?,?,?,?,'active',?,?,1)",
      )
      .run(
        chapterId,
        ownerId,
        input.chapter.title,
        input.chapter.intent,
        input.chapter.startDate,
        input.chapter.endDate,
        now,
        now,
      );
    const insertMilestone = this.connection.sqlite.prepare(
      "INSERT INTO milestone (id,owner_id,chapter_id,title,done_condition,status,sort_order,created_at,updated_at,version) VALUES (?,?,?,?,?,'active',?,?,?,1)",
    );
    const linkMilestone = this.connection.sqlite.prepare(
      "INSERT INTO milestone_aspect (owner_id,milestone_id,aspect_id) VALUES (?,?,?)",
    );
    input.chapter.milestones.forEach((milestone, index) => {
      const milestoneId = newId();
      insertMilestone.run(
        milestoneId,
        ownerId,
        chapterId,
        milestone.title,
        milestone.doneCondition,
        index,
        now,
        now,
      );
      milestone.aspectIndexes.forEach((aspectIndex) =>
        linkMilestone.run(ownerId, milestoneId, aspectIds[aspectIndex]),
      );
    });
    const insertGuardrail = this.connection.sqlite.prepare(
      "INSERT INTO balance_guardrail (id,owner_id,category,statement,status,created_at,updated_at,version) VALUES (?,?,?,?,'active',?,?,1)",
    );
    input.guardrails.forEach((guardrail) =>
      insertGuardrail.run(
        newId(),
        ownerId,
        guardrail.category,
        guardrail.statement,
        now,
        now,
      ),
    );
    this.connection.sqlite
      .prepare(
        "UPDATE owner SET becoming_statement=?,setup_completed=1,updated_at=?,version=version+1 WHERE id=?",
      )
      .run(input.becomingStatement, now, ownerId);
  }

  listAspects(ownerId: string): AspectRecord[] {
    return this.connection.sqlite
      .prepare(
        `SELECT id, owner_id AS ownerId, name, definition, desired_identity AS desiredIdentity,
          emphasis, sort_order AS sortOrder, archived_at AS archivedAt
         FROM character_aspect WHERE owner_id=? AND archived_at IS NULL ORDER BY sort_order, id`,
      )
      .all(ownerId) as AspectRecord[];
  }

  listNorthStars(ownerId: string): NorthStarRecord[] {
    return this.connection.sqlite
      .prepare(
        `SELECT id, title, motivation, status FROM north_star
         WHERE owner_id=? AND status='active' ORDER BY created_at, id`,
      )
      .all(ownerId) as NorthStarRecord[];
  }

  findActiveChapter(ownerId: string): ChapterRecord | undefined {
    return this.connection.sqlite
      .prepare(
        `SELECT id, title, intent, start_date AS startDate, end_date AS endDate, status
         FROM chapter WHERE owner_id=? AND status='active' LIMIT 1`,
      )
      .get(ownerId) as ChapterRecord | undefined;
  }

  listMilestones(ownerId: string, chapterId: string): MilestoneRecord[] {
    const rows = this.connection.sqlite
      .prepare(
        `SELECT id, chapter_id AS chapterId, title, done_condition AS doneCondition,
          status, sort_order AS sortOrder
         FROM milestone WHERE owner_id=? AND chapter_id=? ORDER BY sort_order, id`,
      )
      .all(ownerId, chapterId) as Array<Omit<MilestoneRecord, "aspectIds">>;
    const link = this.connection.sqlite.prepare(
      "SELECT aspect_id FROM milestone_aspect WHERE owner_id=? AND milestone_id=? ORDER BY aspect_id",
    );
    return rows.map((row) => ({
      ...row,
      aspectIds: (
        link.all(ownerId, row.id) as Array<{ aspect_id: string }>
      ).map((item) => item.aspect_id),
    }));
  }

  listGuardrails(ownerId: string): GuardrailRecord[] {
    return this.connection.sqlite
      .prepare(
        `SELECT id, category, statement, status FROM balance_guardrail
         WHERE owner_id=? ORDER BY created_at, id`,
      )
      .all(ownerId) as GuardrailRecord[];
  }

  private questAspectIds(ownerId: string, questId: string): string[] {
    return (
      this.connection.sqlite
        .prepare(
          "SELECT aspect_id AS aspectId FROM quest_aspect WHERE owner_id=? AND quest_id=? ORDER BY aspect_id",
        )
        .all(ownerId, questId) as Array<{ aspectId: string }>
    ).map((row) => row.aspectId);
  }

  private mapQuest(row: QuestRow, ownerId: string): QuestRecord {
    return { ...row, aspectIds: this.questAspectIds(ownerId, row.id) };
  }

  private loadQuest(ownerId: string, questId: string): QuestRecord {
    const row = this.connection.sqlite
      .prepare(
        `SELECT id, local_date AS localDate, title, done_condition AS doneCondition, reason,
          size, source, status, role, milestone_id AS milestoneId,
          accepted_size AS acceptedSize, accepted_at AS acceptedAt, version
         FROM quest WHERE owner_id=? AND id=?`,
      )
      .get(ownerId, questId) as QuestRow | undefined;
    if (!row) throw new DomainError("QUEST_NOT_FOUND", "Quest not found.");
    return this.mapQuest(row, ownerId);
  }

  findCheckIn(ownerId: string, localDate: string): CheckInRecord | undefined {
    return this.connection.sqlite
      .prepare(
        `SELECT id, local_date AS localDate, capacity, reflection
         FROM daily_check_in WHERE owner_id=? AND local_date=?`,
      )
      .get(ownerId, localDate) as CheckInRecord | undefined;
  }

  upsertCheckIn(input: {
    id: string;
    ownerId: string;
    localDate: string;
    capacity: CheckInRecord["capacity"];
    reflection: string | null;
    now: string;
  }): CheckInRecord {
    this.connection.sqlite
      .prepare(
        `INSERT INTO daily_check_in(id,owner_id,local_date,capacity,reflection,created_at,updated_at,version)
         VALUES (?,?,?,?,?,?,?,1)
         ON CONFLICT(owner_id,local_date) DO UPDATE SET
           capacity=excluded.capacity,
           reflection=excluded.reflection,
           updated_at=excluded.updated_at,
           version=daily_check_in.version+1`,
      )
      .run(
        input.id,
        input.ownerId,
        input.localDate,
        input.capacity,
        input.reflection,
        input.now,
        input.now,
      );
    return this.findCheckIn(input.ownerId, input.localDate)!;
  }

  listQuestsForDate(ownerId: string, localDate: string): QuestRecord[] {
    const rows = this.connection.sqlite
      .prepare(
        `SELECT id, local_date AS localDate, title, done_condition AS doneCondition, reason,
          size, source, status, role, milestone_id AS milestoneId,
          accepted_size AS acceptedSize, accepted_at AS acceptedAt, version
         FROM quest WHERE owner_id=? AND local_date=? ORDER BY created_at, id`,
      )
      .all(ownerId, localDate) as QuestRow[];
    return rows.map((row) => this.mapQuest(row, ownerId));
  }

  listUnresolvedAcceptedBefore(
    ownerId: string,
    localDate: string,
  ): QuestRecord[] {
    const rows = this.connection.sqlite
      .prepare(
        `SELECT id, local_date AS localDate, title, done_condition AS doneCondition, reason,
          size, source, status, role, milestone_id AS milestoneId,
          accepted_size AS acceptedSize, accepted_at AS acceptedAt, version
         FROM quest WHERE owner_id=? AND local_date<? AND status='accepted'
         ORDER BY local_date, created_at, id`,
      )
      .all(ownerId, localDate) as QuestRow[];
    return rows.map((row) => this.mapQuest(row, ownerId));
  }

  findQuest(ownerId: string, questId: string): QuestRecord | undefined {
    const row = this.connection.sqlite
      .prepare(
        `SELECT id, local_date AS localDate, title, done_condition AS doneCondition, reason,
          size, source, status, role, milestone_id AS milestoneId,
          accepted_size AS acceptedSize, accepted_at AS acceptedAt, version
         FROM quest WHERE owner_id=? AND id=?`,
      )
      .get(ownerId, questId) as QuestRow | undefined;
    return row ? this.mapQuest(row, ownerId) : undefined;
  }

  private replaceQuestAspects(
    ownerId: string,
    questId: string,
    aspectIds: string[],
  ): void {
    this.connection.sqlite
      .prepare("DELETE FROM quest_aspect WHERE owner_id=? AND quest_id=?")
      .run(ownerId, questId);
    const insert = this.connection.sqlite.prepare(
      "INSERT INTO quest_aspect(owner_id,quest_id,aspect_id) VALUES (?,?,?)",
    );
    for (const aspectId of aspectIds) insert.run(ownerId, questId, aspectId);
  }

  createQuest(input: {
    id: string;
    ownerId: string;
    localDate: string;
    title: string;
    doneCondition: string;
    reason: string;
    size: "small" | "standard" | "major";
    source: "owner" | "deterministic";
    milestoneId: string | null;
    aspectIds: string[];
    now: string;
  }): QuestRecord {
    this.connection.sqlite
      .prepare(
        `INSERT INTO quest
         (id,owner_id,local_date,title,done_condition,reason,size,source,status,milestone_id,created_at,updated_at,version)
         VALUES (?,?,?,?,?,?,?,?,'proposed',?,?,?,1)`,
      )
      .run(
        input.id,
        input.ownerId,
        input.localDate,
        input.title,
        input.doneCondition,
        input.reason,
        input.size,
        input.source,
        input.milestoneId,
        input.now,
        input.now,
      );
    this.replaceQuestAspects(input.ownerId, input.id, input.aspectIds);
    return this.loadQuest(input.ownerId, input.id);
  }

  updateProposedQuest(input: {
    ownerId: string;
    questId: string;
    title: string;
    doneCondition: string;
    reason: string;
    size: "small" | "standard" | "major";
    milestoneId: string | null;
    aspectIds: string[];
    now: string;
  }): QuestRecord {
    const updated = this.connection.sqlite
      .prepare(
        `UPDATE quest SET title=?, done_condition=?, reason=?, size=?, milestone_id=?,
         updated_at=?, version=version+1
         WHERE owner_id=? AND id=? AND status='proposed'`,
      )
      .run(
        input.title,
        input.doneCondition,
        input.reason,
        input.size,
        input.milestoneId,
        input.now,
        input.ownerId,
        input.questId,
      ).changes;
    if (updated !== 1)
      throw new DomainError(
        "QUEST_NOT_EDITABLE",
        "Only proposed quests can be edited.",
      );
    this.replaceQuestAspects(input.ownerId, input.questId, input.aspectIds);
    return this.loadQuest(input.ownerId, input.questId);
  }

  acceptQuest(input: {
    ownerId: string;
    questId: string;
    role: QuestRole;
    now: string;
  }): QuestRecord {
    const updated = this.connection.sqlite
      .prepare(
        `UPDATE quest SET status='accepted', role=?, accepted_size=size, accepted_at=?,
         updated_at=?, version=version+1
         WHERE owner_id=? AND id=? AND status='proposed'`,
      )
      .run(
        input.role,
        input.now,
        input.now,
        input.ownerId,
        input.questId,
      ).changes;
    if (updated !== 1)
      throw new DomainError(
        "QUEST_NOT_ACCEPTABLE",
        "Only a proposed quest can be accepted.",
      );
    return this.loadQuest(input.ownerId, input.questId);
  }

  declineQuest(ownerId: string, questId: string, now: string): QuestRecord {
    const updated = this.connection.sqlite
      .prepare(
        `UPDATE quest SET status='declined', updated_at=?, version=version+1
         WHERE owner_id=? AND id=? AND status='proposed'`,
      )
      .run(now, ownerId, questId).changes;
    if (updated !== 1)
      throw new DomainError(
        "QUEST_NOT_DECLINABLE",
        "Only a proposed quest can be declined.",
      );
    return this.loadQuest(ownerId, questId);
  }

  swapAcceptedQuest(input: {
    ownerId: string;
    acceptedQuestId: string;
    replacementQuestId: string;
    role: QuestRole;
    now: string;
  }): { declined: QuestRecord; accepted: QuestRecord } {
    const declined = this.connection.sqlite
      .prepare(
        `UPDATE quest SET status='declined', role=NULL, accepted_size=NULL, accepted_at=NULL,
         updated_at=?, version=version+1
         WHERE owner_id=? AND id=? AND status='accepted'`,
      )
      .run(input.now, input.ownerId, input.acceptedQuestId).changes;
    if (declined !== 1)
      throw new DomainError(
        "QUEST_NOT_SWAPPABLE",
        "Only an accepted quest can be swapped.",
      );
    const accepted = this.connection.sqlite
      .prepare(
        `UPDATE quest SET status='accepted', role=?, accepted_size=size, accepted_at=?,
         updated_at=?, version=version+1
         WHERE owner_id=? AND id=? AND status='proposed'`,
      )
      .run(
        input.role,
        input.now,
        input.now,
        input.ownerId,
        input.replacementQuestId,
      ).changes;
    if (accepted !== 1)
      throw new DomainError(
        "QUEST_NOT_ACCEPTABLE",
        "Replacement must be a proposed quest.",
      );
    return {
      declined: this.loadQuest(input.ownerId, input.acceptedQuestId),
      accepted: this.loadQuest(input.ownerId, input.replacementQuestId),
    };
  }

  resolveQuest(input: {
    id: string;
    ownerId: string;
    questId: string;
    outcome: "completed" | "attempted" | "dropped";
    reflection: string | null;
    acceptedSize: "small" | "standard" | "major";
    now: string;
  }): QuestRecord {
    this.connection.sqlite
      .prepare(
        `INSERT INTO quest_outcome(id,quest_id,owner_id,outcome,occurred_at,reflection,accepted_size)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(
        input.id,
        input.questId,
        input.ownerId,
        input.outcome,
        input.now,
        input.reflection,
        input.acceptedSize,
      );
    return this.loadQuest(input.ownerId, input.questId);
  }

  private mapBriefing(
    ownerId: string,
    row: {
      id: string;
      localDate: string;
      inputFingerprint: string;
      generatorVersion: string;
      generatorKind: "deterministic";
      mirror: string;
      status: BriefingRecord["status"];
    },
  ): BriefingRecord {
    const suggestions = this.connection.sqlite
      .prepare(
        `SELECT s.id, s.quest_id AS questId, s.role, s.sort_order AS sortOrder, q.title AS title
         FROM briefing_suggestion s
         LEFT JOIN quest q ON q.id=s.quest_id AND q.owner_id=s.owner_id
         WHERE s.owner_id=? AND s.briefing_id=?
         ORDER BY CASE s.role WHEN 'main' THEN 0 ELSE 1 END, s.sort_order, s.id`,
      )
      .all(ownerId, row.id) as BriefingRecord["suggestions"];
    return { ...row, suggestions };
  }

  findBriefing(
    ownerId: string,
    localDate: string,
    fingerprint: string,
    generatorVersion: string,
  ): BriefingRecord | undefined {
    const row = this.connection.sqlite
      .prepare(
        `SELECT id, local_date AS localDate, input_fingerprint AS inputFingerprint,
          generator_version AS generatorVersion, generator_kind AS generatorKind,
          mirror, status
         FROM briefing WHERE owner_id=? AND local_date=? AND input_fingerprint=? AND generator_version=?`,
      )
      .get(ownerId, localDate, fingerprint, generatorVersion) as
      | Omit<BriefingRecord, "suggestions">
      | undefined;
    return row ? this.mapBriefing(ownerId, row) : undefined;
  }

  findLatestBriefing(
    ownerId: string,
    localDate: string,
  ): BriefingRecord | undefined {
    const row = this.connection.sqlite
      .prepare(
        `SELECT id, local_date AS localDate, input_fingerprint AS inputFingerprint,
          generator_version AS generatorVersion, generator_kind AS generatorKind,
          mirror, status
         FROM briefing WHERE owner_id=? AND local_date=?
         ORDER BY generated_at DESC, id DESC LIMIT 1`,
      )
      .get(ownerId, localDate) as
      | Omit<BriefingRecord, "suggestions">
      | undefined;
    return row ? this.mapBriefing(ownerId, row) : undefined;
  }

  saveBriefing(input: {
    id: string;
    ownerId: string;
    localDate: string;
    fingerprint: string;
    generatorVersion: string;
    mirror: string;
    now: string;
    suggestions: Array<{
      id: string;
      questId: string | null;
      role: QuestRole;
      sortOrder: number;
    }>;
  }): BriefingRecord {
    this.connection.sqlite
      .prepare(
        `UPDATE briefing SET status='superseded'
         WHERE owner_id=? AND local_date=? AND status IN ('draft','presented')
           AND NOT (input_fingerprint=? AND generator_version=?)`,
      )
      .run(
        input.ownerId,
        input.localDate,
        input.fingerprint,
        input.generatorVersion,
      );
    this.connection.sqlite
      .prepare(
        `INSERT INTO briefing
         (id,owner_id,local_date,input_fingerprint,generator_version,generator_kind,mirror,generated_at,status)
         VALUES (?,?,?,?,?,'deterministic',?,?,'presented')`,
      )
      .run(
        input.id,
        input.ownerId,
        input.localDate,
        input.fingerprint,
        input.generatorVersion,
        input.mirror,
        input.now,
      );
    const insert = this.connection.sqlite.prepare(
      `INSERT INTO briefing_suggestion(id,briefing_id,owner_id,quest_id,role,sort_order)
       VALUES (?,?,?,?,?,?)`,
    );
    for (const suggestion of input.suggestions)
      insert.run(
        suggestion.id,
        input.id,
        input.ownerId,
        suggestion.questId,
        suggestion.role,
        suggestion.sortOrder,
      );
    return this.findBriefing(
      input.ownerId,
      input.localDate,
      input.fingerprint,
      input.generatorVersion,
    )!;
  }

  listOutcomes(
    ownerId: string,
    limit: number,
    cursor?: string,
  ): { items: QuestOutcomeRecord[]; nextCursor: string | null } {
    const rows = (
      cursor
        ? (this.connection.sqlite
            .prepare(
              `SELECT o.id, o.quest_id AS questId, o.outcome, o.occurred_at AS occurredAt,
                o.reflection, q.title AS questTitle, q.local_date AS localDate
               FROM quest_outcome o JOIN quest q ON q.id=o.quest_id AND q.owner_id=o.owner_id
               WHERE o.owner_id=? AND (o.occurred_at < ? OR (o.occurred_at = ? AND o.id < ?))
               ORDER BY o.occurred_at DESC, o.id DESC LIMIT ?`,
            )
            .all(
              ownerId,
              cursor.split("|")[0],
              cursor.split("|")[0],
              cursor.split("|")[1],
              limit + 1,
            ) as QuestOutcomeRecord[])
        : (this.connection.sqlite
            .prepare(
              `SELECT o.id, o.quest_id AS questId, o.outcome, o.occurred_at AS occurredAt,
                o.reflection, q.title AS questTitle, q.local_date AS localDate
               FROM quest_outcome o JOIN quest q ON q.id=o.quest_id AND q.owner_id=o.owner_id
               WHERE o.owner_id=?
               ORDER BY o.occurred_at DESC, o.id DESC LIMIT ?`,
            )
            .all(ownerId, limit + 1) as QuestOutcomeRecord[])
    ) as QuestOutcomeRecord[];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: hasMore && last ? `${last.occurredAt}|${last.id}` : null,
    };
  }

  findLastActivityDate(ownerId: string): string | null {
    const row = this.connection.sqlite
      .prepare(
        `SELECT max(d) AS value FROM (
           SELECT local_date AS d FROM daily_check_in WHERE owner_id=?
           UNION ALL
           SELECT local_date AS d FROM quest WHERE owner_id=?
           UNION ALL
           SELECT q.local_date AS d FROM quest_outcome o
             JOIN quest q ON q.id=o.quest_id AND q.owner_id=o.owner_id
             WHERE o.owner_id=?
         )`,
      )
      .get(ownerId, ownerId, ownerId) as { value: string | null };
    return row.value ?? null;
  }

  aspectExists(ownerId: string, aspectId: string): boolean {
    return (
      (this.connection.sqlite
        .prepare(
          "SELECT 1 FROM character_aspect WHERE owner_id=? AND id=? AND archived_at IS NULL",
        )
        .get(ownerId, aspectId) as { 1: number } | undefined) !== undefined
    );
  }

  milestoneExists(ownerId: string, milestoneId: string): boolean {
    return (
      (this.connection.sqlite
        .prepare("SELECT 1 FROM milestone WHERE owner_id=? AND id=?")
        .get(ownerId, milestoneId) as { 1: number } | undefined) !== undefined
    );
  }
}
