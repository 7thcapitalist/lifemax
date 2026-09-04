import { eq } from "drizzle-orm";
import type { Clock } from "@/application/ports/time";
import type { OnboardingInput } from "@/contracts/http";
import { assertOnboardingCharacter } from "@/domain/character/invariants";
import { DomainError } from "@/domain/shared/errors";
import { newId } from "@/domain/shared/id";
import type { DatabaseConnection } from "@/infrastructure/db/client";
import { owners } from "@/infrastructure/db/schema";

export class OnboardingService {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly clock: Clock,
  ) {}

  complete(ownerId: string, input: OnboardingInput): void {
    assertOnboardingCharacter(input.aspects);
    if (input.northStars.length > 3)
      throw new DomainError(
        "NORTH_STAR_LIMIT",
        "At most three North Stars may be active.",
      );
    const start = new Date(`${input.chapter.startDate}T00:00:00Z`);
    const end = new Date(`${input.chapter.endDate}T00:00:00Z`);
    const duration = (end.getTime() - start.getTime()) / 86_400_000;
    if (duration < 42 || duration > 84)
      throw new DomainError(
        "CHAPTER_DURATION",
        "An active chapter must span 6–12 weeks.",
      );
    const now = this.clock.now().toISOString();

    this.connection.sqlite.transaction(() => {
      const owner = this.connection.db
        .select()
        .from(owners)
        .where(eq(owners.id, ownerId))
        .get();
      if (!owner) throw new DomainError("OWNER_NOT_FOUND", "Owner not found.");
      if (owner.setupCompleted)
        throw new DomainError(
          "ONBOARDING_COMPLETE",
          "Onboarding is already complete.",
        );

      const aspectIds = input.aspects.map(() =>
        newId(this.clock.now().getTime()),
      );
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
      this.connection.db
        .update(owners)
        .set({
          becomingStatement: input.becomingStatement,
          setupCompleted: true,
          updatedAt: now,
          version: owner.version + 1,
        })
        .where(eq(owners.id, ownerId))
        .run();
    })();
  }
}
