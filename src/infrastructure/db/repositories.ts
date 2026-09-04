import type {
  OwnerRecord,
  OwnerRepository,
  SessionRepository,
  StoredSession,
  TransactionPort,
} from "@/application/ports/persistence";
import type { OnboardingInput } from "@/contracts/http";
import { newId } from "@/domain/shared/id";
import type { DatabaseConnection } from "./client";

export class SqliteRepositories
  implements OwnerRepository, SessionRepository, TransactionPort
{
  readonly owners: OwnerRepository = this;
  readonly sessions: SessionRepository = this;
  readonly transactions: TransactionPort = this;

  constructor(private readonly connection: DatabaseConnection) {}

  run<T>(work: () => T): T {
    return this.connection.sqlite.transaction(work)();
  }

  count(): number {
    return this.connection.sqlite
      .prepare("SELECT count(*) FROM owner")
      .pluck()
      .get() as number;
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
        "SELECT id, owner_id AS ownerId, token_hash AS tokenHash, csrf_hash AS csrfHash, idle_expires_at AS idleExpiresAt, absolute_expires_at AS absoluteExpiresAt, revoked_at AS revokedAt FROM session WHERE token_hash=?",
      )
      .get(tokenHash) as StoredSession | undefined;
  }

  rotate(
    id: string,
    expectedTokenHash: string,
    nextTokenHash: string,
    now: string,
    idleExpiresAt: string,
  ): boolean {
    return (
      this.connection.sqlite
        .prepare(
          "UPDATE session SET token_hash=?,last_used_at=?,idle_expires_at=? WHERE id=? AND token_hash=? AND revoked_at IS NULL",
        )
        .run(nextTokenHash, now, idleExpiresAt, id, expectedTokenHash)
        .changes === 1
    );
  }

  revoke(tokenHash: string, now: string): void {
    this.connection.sqlite
      .prepare(
        "UPDATE session SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL",
      )
      .run(now, tokenHash);
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
}
