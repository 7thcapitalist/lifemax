import type {
  BriefingRecord,
  CharacterReadRepository,
  CheckInRecord,
  OwnerRepository,
  PlanningRepository,
  QuestRecord,
  TransactionPort,
} from "@/application/ports/persistence";
import type { BriefingGenerator } from "@/application/ports/briefing";
import type { CalendarService, Clock } from "@/application/ports/time";
import type {
  AcceptQuestInput,
  CheckInInput,
  CreateQuestInput,
  ResolveQuestInput,
  SwapQuestInput,
  UpdateQuestInput,
} from "@/contracts/http";
import type { Capacity } from "@/domain/briefing/generator";
import {
  assertCanResolve,
  assertDailyAcceptedQuestLimit,
  assertQuestAcceptable,
} from "@/domain/planning/invariants";
import { DomainError } from "@/domain/shared/errors";
import { newId } from "@/domain/shared/id";

function isSqliteConstraint(error: unknown, fragment: string): boolean {
  return error instanceof Error && error.message.includes(fragment);
}

export class PlanningService {
  constructor(
    private readonly owners: OwnerRepository,
    private readonly character: CharacterReadRepository,
    private readonly planning: PlanningRepository,
    private readonly transactions: TransactionPort,
    private readonly clock: Clock,
    private readonly calendar: CalendarService,
    private readonly briefingGenerator: BriefingGenerator,
  ) {}

  private localDateFor(ownerId: string): string {
    const owner = this.owners.findById(ownerId);
    if (!owner) throw new DomainError("OWNER_NOT_FOUND", "Owner not found.");
    return this.calendar.localDate(this.clock.now(), owner.timezone);
  }

  private verifyLinks(
    ownerId: string,
    aspectIds: string[],
    milestoneId: string | null | undefined,
  ): void {
    for (const aspectId of aspectIds) {
      if (!this.planning.aspectExists(ownerId, aspectId))
        throw new DomainError(
          "ASPECT_NOT_FOUND",
          "Aspect not found for this owner.",
        );
    }
    if (milestoneId && !this.planning.milestoneExists(ownerId, milestoneId))
      throw new DomainError(
        "MILESTONE_NOT_FOUND",
        "Milestone not found for this owner.",
      );
  }

  upsertCheckIn(
    ownerId: string,
    localDate: string,
    input: CheckInInput,
  ): CheckInRecord {
    const owner = this.owners.findById(ownerId);
    if (!owner) throw new DomainError("OWNER_NOT_FOUND", "Owner not found.");
    if (!owner.setupCompleted)
      throw new DomainError(
        "ONBOARDING_REQUIRED",
        "Complete onboarding before planning.",
      );
    const now = this.clock.now().toISOString();
    return this.planning.upsertCheckIn({
      id: newId(this.clock.now().getTime()),
      ownerId,
      localDate,
      capacity: input.capacity,
      reflection: input.reflection?.trim() ? input.reflection.trim() : null,
      now,
    });
  }

  createQuest(ownerId: string, input: CreateQuestInput): QuestRecord {
    const owner = this.owners.findById(ownerId);
    if (!owner) throw new DomainError("OWNER_NOT_FOUND", "Owner not found.");
    if (!owner.setupCompleted)
      throw new DomainError(
        "ONBOARDING_REQUIRED",
        "Complete onboarding before planning.",
      );
    const localDate =
      input.localDate ??
      this.calendar.localDate(this.clock.now(), owner.timezone);
    const aspectIds = input.aspectIds ?? [];
    const milestoneId = input.milestoneId ?? null;
    assertQuestAcceptable({
      title: input.title,
      doneCondition: input.doneCondition,
      reason: input.reason,
      aspectIds,
      milestoneId,
    });
    this.verifyLinks(ownerId, aspectIds, milestoneId);
    const now = this.clock.now().toISOString();
    return this.transactions.run(() =>
      this.planning.createQuest({
        id: newId(this.clock.now().getTime()),
        ownerId,
        localDate,
        title: input.title,
        doneCondition: input.doneCondition,
        reason: input.reason,
        size: input.size ?? "standard",
        source: "owner",
        milestoneId,
        aspectIds,
        now,
      }),
    );
  }

  updateQuest(
    ownerId: string,
    questId: string,
    input: UpdateQuestInput,
  ): QuestRecord {
    return this.transactions.run(() => {
      const existing = this.planning.findQuest(ownerId, questId);
      if (!existing)
        throw new DomainError("QUEST_NOT_FOUND", "Quest not found.");
      if (existing.status !== "proposed")
        throw new DomainError(
          "QUEST_NOT_EDITABLE",
          "Only proposed quests can be edited.",
        );
      const title = input.title ?? existing.title;
      const doneCondition = input.doneCondition ?? existing.doneCondition;
      const reason = input.reason ?? existing.reason;
      const size = input.size ?? existing.size;
      const aspectIds = input.aspectIds ?? existing.aspectIds;
      const milestoneId =
        input.milestoneId !== undefined
          ? input.milestoneId
          : existing.milestoneId;
      assertQuestAcceptable({
        title,
        doneCondition,
        reason,
        aspectIds,
        milestoneId,
      });
      this.verifyLinks(ownerId, aspectIds, milestoneId);
      return this.planning.updateProposedQuest({
        ownerId,
        questId,
        title,
        doneCondition,
        reason,
        size,
        milestoneId,
        aspectIds,
        now: this.clock.now().toISOString(),
      });
    });
  }

  acceptQuest(
    ownerId: string,
    questId: string,
    input: AcceptQuestInput,
  ): QuestRecord {
    return this.transactions.run(() => {
      const quest = this.planning.findQuest(ownerId, questId);
      if (!quest) throw new DomainError("QUEST_NOT_FOUND", "Quest not found.");
      if (quest.status !== "proposed")
        throw new DomainError(
          "QUEST_NOT_ACCEPTABLE",
          "Only a proposed quest can be accepted.",
        );
      assertQuestAcceptable(quest);
      const dayQuests = this.planning.listQuestsForDate(
        ownerId,
        quest.localDate,
      );
      assertDailyAcceptedQuestLimit(
        [
          ...dayQuests,
          { localDate: quest.localDate, status: "accepted", role: input.role },
        ],
        quest.localDate,
      );
      if (
        input.role === "main" &&
        dayQuests.some((q) => q.status === "accepted" && q.role === "main")
      )
        throw new DomainError(
          "MAIN_QUEST_LIMIT",
          "At most one accepted quest may be main.",
        );
      try {
        return this.planning.acceptQuest({
          ownerId,
          questId,
          role: input.role,
          now: this.clock.now().toISOString(),
        });
      } catch (error) {
        if (isSqliteConstraint(error, "quest_daily_limit"))
          throw new DomainError(
            "QUEST_DAILY_LIMIT",
            "At most three quests may be accepted per date.",
          );
        if (isSqliteConstraint(error, "one_main_quest_per_date"))
          throw new DomainError(
            "MAIN_QUEST_LIMIT",
            "At most one accepted quest may be main.",
          );
        throw error;
      }
    });
  }

  declineQuest(ownerId: string, questId: string): QuestRecord {
    return this.transactions.run(() => {
      const quest = this.planning.findQuest(ownerId, questId);
      if (!quest) throw new DomainError("QUEST_NOT_FOUND", "Quest not found.");
      if (quest.status !== "proposed")
        throw new DomainError(
          "QUEST_NOT_DECLINABLE",
          "Only a proposed quest can be declined.",
        );
      return this.planning.declineQuest(
        ownerId,
        questId,
        this.clock.now().toISOString(),
      );
    });
  }

  swapQuest(
    ownerId: string,
    acceptedQuestId: string,
    input: SwapQuestInput,
  ): { declined: QuestRecord; accepted: QuestRecord } {
    return this.transactions.run(() => {
      const accepted = this.planning.findQuest(ownerId, acceptedQuestId);
      if (!accepted)
        throw new DomainError("QUEST_NOT_FOUND", "Quest not found.");
      if (accepted.status !== "accepted")
        throw new DomainError(
          "QUEST_NOT_SWAPPABLE",
          "Only an accepted quest can be swapped.",
        );
      const replacement = this.planning.findQuest(
        ownerId,
        input.replacementQuestId,
      );
      if (!replacement)
        throw new DomainError(
          "REPLACEMENT_NOT_FOUND",
          "Replacement quest not found.",
        );
      if (replacement.status !== "proposed")
        throw new DomainError(
          "QUEST_NOT_ACCEPTABLE",
          "Replacement must be a proposed quest.",
        );
      if (replacement.localDate !== accepted.localDate)
        throw new DomainError(
          "QUEST_DATE_MISMATCH",
          "Replacement must share the accepted quest date.",
        );
      assertQuestAcceptable(replacement);
      try {
        return this.planning.swapAcceptedQuest({
          ownerId,
          acceptedQuestId,
          replacementQuestId: input.replacementQuestId,
          role: input.role,
          now: this.clock.now().toISOString(),
        });
      } catch (error) {
        if (isSqliteConstraint(error, "quest_daily_limit"))
          throw new DomainError(
            "QUEST_DAILY_LIMIT",
            "At most three quests may be accepted per date.",
          );
        if (isSqliteConstraint(error, "one_main_quest_per_date"))
          throw new DomainError(
            "MAIN_QUEST_LIMIT",
            "At most one accepted quest may be main.",
          );
        if (isSqliteConstraint(error, "quest_illegal_transition"))
          throw new DomainError(
            "QUEST_NOT_SWAPPABLE",
            "Only an accepted quest can be swapped.",
          );
        throw error;
      }
    });
  }

  resolveQuest(
    ownerId: string,
    questId: string,
    input: ResolveQuestInput,
  ): QuestRecord {
    return this.transactions.run(() => {
      const quest = this.planning.findQuest(ownerId, questId);
      if (!quest) throw new DomainError("QUEST_NOT_FOUND", "Quest not found.");
      assertCanResolve(quest.status, false);
      if (!quest.acceptedSize)
        throw new DomainError(
          "QUEST_TERMINAL",
          "Only an unresolved accepted quest can receive an outcome.",
        );
      try {
        return this.planning.resolveQuest({
          id: newId(this.clock.now().getTime()),
          ownerId,
          questId,
          outcome: input.outcome,
          reflection: input.reflection?.trim() ? input.reflection.trim() : null,
          acceptedSize: quest.acceptedSize,
          now: this.clock.now().toISOString(),
        });
      } catch (error) {
        if (isSqliteConstraint(error, "quest_not_resolvable"))
          throw new DomainError(
            "QUEST_TERMINAL",
            "Only an unresolved accepted quest can receive an outcome.",
          );
        throw error;
      }
    });
  }

  generateBriefing(ownerId: string, localDate: string): BriefingRecord {
    return this.transactions.run(() => {
      const owner = this.owners.findById(ownerId);
      if (!owner) throw new DomainError("OWNER_NOT_FOUND", "Owner not found.");
      const checkIn = this.planning.findCheckIn(ownerId, localDate);
      if (!checkIn)
        throw new DomainError(
          "CHECK_IN_REQUIRED",
          "Set capacity before generating a briefing.",
        );
      const chapter = this.character.findActiveChapter(ownerId);
      const milestones = chapter
        ? this.character.listMilestones(ownerId, chapter.id)
        : [];
      const milestoneOrder = new Map(
        milestones.map((milestone) => [milestone.id, milestone.sortOrder]),
      );
      const aspects = this.character.listAspects(ownerId);
      const aspectEmphasis = new Map(
        aspects.map((aspect) => [aspect.id, aspect.emphasis]),
      );
      const unresolved = this.planning.listUnresolvedAcceptedBefore(
        ownerId,
        localDate,
      );
      const todayQuests = this.planning.listQuestsForDate(ownerId, localDate);
      const proposed = todayQuests.filter(
        (quest) => quest.status === "proposed",
      );
      const guardrails = this.character
        .listGuardrails(ownerId)
        .filter((guardrail) => guardrail.status === "active");

      const draft = this.briefingGenerator.generate({
        ownerLocalDate: localDate,
        capacity: checkIn.capacity as Capacity,
        activeChapter: chapter
          ? { id: chapter.id, title: chapter.title }
          : null,
        unresolvedQuestIds: unresolved.map((quest) => quest.id),
        proposedQuests: proposed.map((quest) => {
          const linked = quest.aspectIds.length
            ? quest.aspectIds
            : quest.milestoneId
              ? (milestones.find((m) => m.id === quest.milestoneId)
                  ?.aspectIds ?? [])
              : [];
          const dormantOnly =
            linked.length > 0 &&
            linked.every((id) => aspectEmphasis.get(id) === "dormant");
          return {
            id: quest.id,
            title: quest.title,
            milestoneOrder: quest.milestoneId
              ? (milestoneOrder.get(quest.milestoneId) ?? 999)
              : 999,
            dormantOnly,
          };
        }),
        activeGuardrails: guardrails.map((guardrail) => ({
          id: guardrail.id,
          statement: guardrail.statement,
        })),
      });

      const existing = this.planning.findBriefing(
        ownerId,
        localDate,
        draft.fingerprint,
        draft.version,
      );
      if (existing) return existing;

      const suggestions: Array<{
        id: string;
        questId: string | null;
        role: "main" | "side";
        sortOrder: number;
      }> = [];
      if (draft.main)
        suggestions.push({
          id: newId(this.clock.now().getTime()),
          questId: draft.main.questId,
          role: "main",
          sortOrder: 0,
        });
      draft.sides.forEach((side, index) =>
        suggestions.push({
          id: newId(this.clock.now().getTime() + index + 1),
          questId: side.questId,
          role: "side",
          sortOrder: index,
        }),
      );

      return this.planning.saveBriefing({
        id: newId(this.clock.now().getTime()),
        ownerId,
        localDate,
        fingerprint: draft.fingerprint,
        generatorVersion: draft.version,
        mirror: draft.mirror,
        now: this.clock.now().toISOString(),
        suggestions,
      });
    });
  }
}
