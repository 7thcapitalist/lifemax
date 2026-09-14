export type BootstrapPublic = {
  authenticated: false;
  hasOwner: boolean;
  setupMode: "disabled" | "local";
  aiMode: "disabled";
};

export type BootstrapAuthed = {
  authenticated: true;
  hasOwner: true;
  setupMode: "disabled" | "local";
  aiMode: "disabled";
  csrfToken: string;
  owner: {
    id: string;
    displayName: string;
    timezone: string;
    setupCompleted: boolean;
    version: number;
  };
  localDate: string;
  navigation: ReadonlyArray<"today" | "character" | "chronicle" | "onboarding">;
  setup: { completed: boolean; hasActiveChapter: boolean };
  activeChapter: { id: string; title: string } | null;
};

export type BootstrapResponse = BootstrapPublic | BootstrapAuthed;

export type Capacity = "low" | "normal" | "high";

export type QuestStatus =
  | "proposed"
  | "accepted"
  | "declined"
  | "completed"
  | "attempted"
  | "dropped";

export type QuestView = {
  id: string;
  localDate: string;
  title: string;
  doneCondition: string;
  reason: string;
  size: "small" | "standard" | "major";
  source: "owner" | "deterministic";
  status: QuestStatus;
  role: "main" | "side" | null;
  milestoneId: string | null;
  aspectIds: string[];
  version: number;
};

export type TodayResponse = {
  localDate: string;
  unresolvedPriorQuests: QuestView[];
  checkIn: {
    id: string;
    localDate: string;
    capacity: Capacity;
    reflection: string | null;
  } | null;
  briefing: {
    id: string;
    localDate: string;
    mirror: string;
    status: string;
    generatorKind: "deterministic";
    suggestions: Array<{
      id: string;
      questId: string | null;
      role: "main" | "side";
      sortOrder: number;
      title: string | null;
    }>;
  } | null;
  quests: QuestView[];
  missedDayGap: {
    daysSinceLastActivity: number;
    message: string;
  } | null;
  activeChapter: {
    id: string;
    title: string;
    intent: string;
    startDate: string;
    endDate: string;
    status: string;
  } | null;
};

export type CharacterResponse = {
  becomingStatement: string;
  aspects: Array<{
    id: string;
    name: string;
    definition: string;
    desiredIdentity: string;
    emphasis: "active" | "maintenance" | "dormant";
    sortOrder: number;
  }>;
  northStars: Array<{
    id: string;
    title: string;
    motivation: string;
    status: string;
  }>;
  activeChapter: {
    id: string;
    title: string;
    intent: string;
    startDate: string;
    endDate: string;
    status: string;
    milestones: Array<{
      id: string;
      title: string;
      doneCondition: string;
      status: string;
      aspectIds: string[];
    }>;
  } | null;
  guardrails: Array<{
    id: string;
    category: string;
    statement: string;
    status: string;
  }>;
  character: { id: string };
  attributes: Array<{
    id: string;
    name: string;
    emphasis: "active" | "maintenance" | "dormant";
    sortOrder: number;
    level: number;
    xpIntoLevel: number;
    xpForNextLevel: number;
  }>;
  wallet: { coinBalance: number };
  activeQuest: {
    id: string;
    title: string;
    progressCurrent: number;
    progressTarget: number;
  } | null;
  achievements: { unlocked: number; total: number };
};

export type ChroniclePage = {
  items: Array<{
    id: string;
    questId: string;
    outcome: "completed" | "attempted" | "dropped";
    occurredAt: string;
    reflection: string | null;
    questTitle: string;
    localDate: string;
  }>;
  nextCursor: string | null;
};
