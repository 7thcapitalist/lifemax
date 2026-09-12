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

export type CharacterGameSheet = {
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
export interface GameRepository {
  characterSheet(ownerId: string): CharacterGameSheet;
  gameMasterContext(
    ownerId: string,
    localDate: string,
    capacityOverride?: "low" | "normal" | "high",
  ): GameMasterContext;
  savePlan(
    ownerId: string,
    localDate: string,
    now: string,
    generated: Pick<
      DailyPlanResponse,
      "planFingerprint" | "generatorVersion"
    > & { proposals: MissionProposal[] },
    context: GameMasterContext,
  ): DailyPlanResponse;
  listMissions(ownerId: string, localDate: string): MissionView[];
  createMission(
    ownerId: string,
    localDate: string,
    input: CreateMissionInput,
    now: string,
  ): MissionView;
  updateMission(
    ownerId: string,
    id: string,
    input: UpdateMissionInput,
    now: string,
  ): MissionView;
  completeMission(
    ownerId: string,
    id: string,
    idempotencyKey: string | undefined,
    now: string,
  ): MissionCompletionResponse;
  listQuests(ownerId: string, localDate?: string): QuestProgressView[];
  listChapters(ownerId: string): ChapterProgressView[];
  getChapter(ownerId: string, id: string): ChapterProgressView;
  createChapter(
    ownerId: string,
    input: CreateChapterInput,
    now: string,
  ): ChapterProgressView;
  updateChapter(
    ownerId: string,
    id: string,
    input: UpdateChapterInput,
    now: string,
  ): ChapterProgressView;
  listAchievements(ownerId: string): AchievementView[];
  listRewards(ownerId: string): RewardView[];
  createReward(
    ownerId: string,
    input: CreateRewardInput,
    now: string,
  ): RewardView;
  updateReward(
    ownerId: string,
    id: string,
    input: UpdateRewardInput,
    now: string,
  ): RewardView;
  redeemReward(
    ownerId: string,
    id: string,
    localDate: string,
    now: string,
  ): RewardRedemptionView;
  listAcademics(ownerId: string): AcademicEntryView[];
  getAcademic(ownerId: string, id: string): AcademicEntryView;
  createAcademic(
    ownerId: string,
    input: CreateAcademicInput,
    now: string,
  ): AcademicEntryView;
  updateAcademic(
    ownerId: string,
    id: string,
    input: UpdateAcademicInput,
    now: string,
  ): AcademicEntryView;
  deleteAcademic(ownerId: string, id: string): void;
}
