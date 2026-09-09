export type ContextValue<T> =
  | { status: "known"; value: T }
  | { status: "unknown"; value: null };
export type MissionSize = "small" | "standard" | "major";
export type MissionKind = "progress" | "rest" | "relationship" | "exploration";
export type MissionView = {
  id: string;
  localDate: string;
  title: string;
  doneCondition: string;
  kind: MissionKind;
  size: MissionSize;
  status: "proposed" | "accepted" | "completed" | "cancelled";
  source: "owner" | "generator";
  attributeIds: string[];
  questId: string | null;
  chapterId: string | null;
  rationale: string | null;
  version: number;
};
export type MissionProposal = Omit<
  MissionView,
  "id" | "localDate" | "status" | "source" | "version" | "rationale"
> & {
  rank: number;
  rationale: string;
  citations: string[];
};
export type DailyPlanResponse = {
  id: string;
  localDate: string;
  planFingerprint: string;
  generatorVersion: string;
  context: GameMasterContext;
  proposals: MissionProposal[];
};
export type GameMasterContext = {
  ownerLocalDate: string;
  becomingStatement: ContextValue<string>;
  attributes: ContextValue<
    Array<{
      id: string;
      name: string;
      emphasis: "active" | "maintenance" | "dormant";
      sortOrder: number;
    }>
  >;
  activeChapter: ContextValue<{ id: string; title: string }>;
  activeGuardrails: ContextValue<
    Array<{ id: string; category: string; statement: string }>
  >;
  recentActivity: ContextValue<
    Array<{
      localDate: string;
      kind: MissionKind;
      completed: boolean;
      attributeIds: string[];
    }>
  >;
  todayCheckIn: ContextValue<{
    capacity: "low" | "normal" | "high";
    reflection: string | null;
  }>;
};
export type GameApiError = {
  code: string;
  message: string;
  requestId: string;
  fieldErrors?: unknown;
};
export type MissionCompletionResponse = {
  mission: MissionView;
  xpAwards: Array<{
    attributeId: string;
    points: number;
    level: number;
    xpIntoLevel: number;
  }>;
  coinAward: number;
  coinBalance: number;
  questProgress: { current: number; target: number } | null;
  chapterProgress: { current: number; target: number } | null;
  newlyUnlockedAchievements: string[];
};
export type RewardView = {
  id: string;
  title: string;
  description: string | null;
  coinCost: number;
  status: "active" | "archived";
  version: number;
};
export type RewardRedemptionView = {
  id: string;
  rewardId: string;
  title: string;
  coinCost: number;
  coinBalance: number;
  localDate: string;
  redeemedAt: string;
};
export type QuestProgressView = {
  id: string;
  localDate: string;
  title: string;
  doneCondition: string;
  reason: string;
  size: MissionSize;
  source: "owner" | "deterministic";
  status:
    | "proposed"
    | "accepted"
    | "declined"
    | "completed"
    | "attempted"
    | "dropped";
  role: "main" | "side" | null;
  milestoneId: string | null;
  progressCurrent: number;
  progressTarget: number;
  version: number;
};
export type ChapterProgressView = {
  id: string;
  title: string;
  intent: string;
  startDate: string;
  endDate: string;
  status: "draft" | "active" | "completed" | "abandoned";
  version: number;
  current: number;
  target: number;
};
export type AchievementView = {
  key: string;
  title: string;
  description: string;
  unlockedAt: string | null;
};
export type AcademicEntryView = {
  id: string;
  kind: string;
  title: string;
  course: string | null;
  term: string | null;
  dueDate: string | null;
  status: "planned" | "in_progress" | "done" | "dropped" | null;
  scoreValue: string | null;
  scoreScale: string | null;
  notes: string | null;
  version: number;
};
