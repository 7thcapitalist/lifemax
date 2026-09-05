import { DomainError } from "@/domain/shared/errors";

export type QuestStatus =
  | "proposed"
  | "accepted"
  | "declined"
  | "completed"
  | "attempted"
  | "dropped";
export type QuestRole = "main" | "side";
export type QuestDraft = {
  title: string;
  doneCondition: string;
  reason: string;
  aspectIds: string[];
  milestoneId?: string | null;
};
export type DatedQuest = {
  localDate: string;
  status: QuestStatus;
  role: QuestRole | null;
};

export function assertQuestAcceptable(quest: QuestDraft): void {
  if (
    !quest.title.trim() ||
    !quest.doneCondition.trim() ||
    !quest.reason.trim()
  ) {
    throw new DomainError(
      "QUEST_FIELDS",
      "A quest needs a title, done condition, and reason.",
    );
  }
  if (quest.aspectIds.length === 0 && !quest.milestoneId) {
    throw new DomainError(
      "QUEST_LINK",
      "A quest must link to an aspect or milestone.",
    );
  }
}

export function assertDailyAcceptedQuestLimit(
  quests: DatedQuest[],
  date: string,
): void {
  const accepted = quests.filter(
    (quest) => quest.localDate === date && quest.status === "accepted",
  );
  if (accepted.length > 3)
    throw new DomainError(
      "QUEST_DAILY_LIMIT",
      "At most three quests may be accepted per date.",
    );
  if (accepted.filter((quest) => quest.role === "main").length > 1) {
    throw new DomainError(
      "MAIN_QUEST_LIMIT",
      "At most one accepted quest may be main.",
    );
  }
}

export function assertCanResolve(
  status: QuestStatus,
  hasOutcome: boolean,
): void {
  if (status !== "accepted" || hasOutcome) {
    throw new DomainError(
      "QUEST_TERMINAL",
      "Only an unresolved accepted quest can receive an outcome.",
    );
  }
}
