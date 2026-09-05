import type { OnboardingInput } from "@/contracts/http";
import type { Capacity } from "@/domain/briefing/generator";
import type { QuestRole, QuestStatus } from "@/domain/planning/invariants";

export type OwnerRecord = {
  id: string;
  displayName: string;
  timezone: string;
  becomingStatement: string;
  setupCompleted: boolean;
  version: number;
};

export type StoredSession = {
  id: string;
  ownerId: string;
  tokenHash: string;
  csrfHash: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  revokedAt: string | null;
  tokenMatch: "current" | "prior";
  matchedTokenExpiresAt: string | null;
  matchedTokenUsesRemaining: number | null;
};

export type AspectRecord = {
  id: string;
  ownerId: string;
  name: string;
  definition: string;
  desiredIdentity: string;
  emphasis: "active" | "maintenance" | "dormant";
  sortOrder: number;
  archivedAt: string | null;
};

export type NorthStarRecord = {
  id: string;
  title: string;
  motivation: string;
  status: "active" | "archived";
};

export type ChapterRecord = {
  id: string;
  title: string;
  intent: string;
  startDate: string;
  endDate: string;
  status: "draft" | "active" | "completed" | "abandoned";
};

export type MilestoneRecord = {
  id: string;
  chapterId: string;
  title: string;
  doneCondition: string;
  status: "planned" | "active" | "completed" | "replaced" | "abandoned";
  sortOrder: number;
  aspectIds: string[];
};

export type GuardrailRecord = {
  id: string;
  category: "sleep" | "connection" | "recovery" | "novelty" | "custom";
  statement: string;
  status: "active" | "paused" | "archived";
};

export type CheckInRecord = {
  id: string;
  localDate: string;
  capacity: Capacity;
  reflection: string | null;
};

export type QuestRecord = {
  id: string;
  localDate: string;
  title: string;
  doneCondition: string;
  reason: string;
  size: "small" | "standard" | "major";
  source: "owner" | "deterministic";
  status: QuestStatus;
  role: QuestRole | null;
  milestoneId: string | null;
  acceptedSize: "small" | "standard" | "major" | null;
  acceptedAt: string | null;
  aspectIds: string[];
  version: number;
};

export type QuestOutcomeRecord = {
  id: string;
  questId: string;
  outcome: "completed" | "attempted" | "dropped";
  occurredAt: string;
  reflection: string | null;
  questTitle: string;
  localDate: string;
};

export type BriefingRecord = {
  id: string;
  localDate: string;
  inputFingerprint: string;
  generatorVersion: string;
  generatorKind: "deterministic";
  mirror: string;
  status: "draft" | "presented" | "accepted" | "superseded" | "failed";
  suggestions: Array<{
    id: string;
    questId: string | null;
    role: QuestRole;
    sortOrder: number;
    title: string | null;
  }>;
};

export interface TransactionPort {
  run<T>(work: () => T): T;
}

export interface OwnerRepository {
  count(): number;
  createWithCredential(input: {
    id: string;
    displayName: string;
    timezone: string;
    passwordHash: string;
    now: string;
  }): void;
  findCredential(): { ownerId: string; passwordHash: string } | undefined;
  findById(ownerId: string): OwnerRecord | undefined;
  completeOnboarding(
    ownerId: string,
    input: OnboardingInput,
    now: string,
  ): void;
}

export interface PrivacyDeletionPort {
  deleteOwnerGraph(ownerId: string): boolean;
}

export interface SessionRepository {
  create(input: {
    id: string;
    ownerId: string;
    tokenHash: string;
    csrfHash: string;
    now: string;
    idleExpiresAt: string;
    absoluteExpiresAt: string;
  }): void;
  findByTokenHash(tokenHash: string): StoredSession | undefined;
  rotate(
    id: string,
    expectedTokenHash: string,
    nextTokenHash: string,
    now: string,
    idleExpiresAt: string,
    previousTokenExpiresAt: string,
    previousTokenUses: number,
    maxPriorGenerations: number,
  ): boolean;
  usePriorToken(
    id: string,
    tokenHash: string,
    now: string,
    idleExpiresAt: string,
  ): boolean;
  revoke(tokenHash: string, now: string): void;
}

export interface CharacterReadRepository {
  listAspects(ownerId: string): AspectRecord[];
  listNorthStars(ownerId: string): NorthStarRecord[];
  findActiveChapter(ownerId: string): ChapterRecord | undefined;
  listMilestones(ownerId: string, chapterId: string): MilestoneRecord[];
  listGuardrails(ownerId: string): GuardrailRecord[];
}

export interface PlanningRepository {
  findCheckIn(ownerId: string, localDate: string): CheckInRecord | undefined;
  upsertCheckIn(input: {
    id: string;
    ownerId: string;
    localDate: string;
    capacity: Capacity;
    reflection: string | null;
    now: string;
  }): CheckInRecord;
  listQuestsForDate(ownerId: string, localDate: string): QuestRecord[];
  listUnresolvedAcceptedBefore(
    ownerId: string,
    localDate: string,
  ): QuestRecord[];
  findQuest(ownerId: string, questId: string): QuestRecord | undefined;
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
  }): QuestRecord;
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
  }): QuestRecord;
  acceptQuest(input: {
    ownerId: string;
    questId: string;
    role: QuestRole;
    now: string;
  }): QuestRecord;
  declineQuest(ownerId: string, questId: string, now: string): QuestRecord;
  swapAcceptedQuest(input: {
    ownerId: string;
    acceptedQuestId: string;
    replacementQuestId: string;
    role: QuestRole;
    now: string;
  }): { declined: QuestRecord; accepted: QuestRecord };
  resolveQuest(input: {
    id: string;
    ownerId: string;
    questId: string;
    outcome: "completed" | "attempted" | "dropped";
    reflection: string | null;
    acceptedSize: "small" | "standard" | "major";
    now: string;
  }): QuestRecord;
  findBriefing(
    ownerId: string,
    localDate: string,
    fingerprint: string,
    generatorVersion: string,
  ): BriefingRecord | undefined;
  findLatestBriefing(
    ownerId: string,
    localDate: string,
  ): BriefingRecord | undefined;
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
  }): BriefingRecord;
  listOutcomes(
    ownerId: string,
    limit: number,
    cursor?: string,
  ): { items: QuestOutcomeRecord[]; nextCursor: string | null };
  findLastActivityDate(ownerId: string): string | null;
  aspectExists(ownerId: string, aspectId: string): boolean;
  milestoneExists(ownerId: string, milestoneId: string): boolean;
}
