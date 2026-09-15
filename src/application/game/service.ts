import type { GameRepository } from "@/application/ports/game";
import type { OwnerRepository } from "@/application/ports/persistence";
import type { CalendarService, Clock } from "@/application/ports/time";
import type {
  CreateAcademicInput,
  CreateChapterInput,
  CreateMissionInput,
  CreateRewardInput,
  DailyPlanInput,
  UpdateAcademicInput,
  UpdateChapterInput,
  UpdateMissionInput,
  UpdateRewardInput,
} from "@/contracts/game";
import type { MissionGenerator } from "@/domain/game-master/generator";
import { DomainError } from "@/domain/shared/errors";

export class GameService {
  constructor(
    private readonly owners: OwnerRepository,
    private readonly game: GameRepository,
    private readonly clock: Clock,
    private readonly calendar: CalendarService,
    private readonly generator: MissionGenerator,
  ) {}
  private owner(ownerId: string) {
    const owner = this.owners.findById(ownerId);
    if (!owner) throw new DomainError("OWNER_NOT_FOUND", "Owner not found.");
    if (!owner.setupCompleted)
      throw new DomainError(
        "ONBOARDING_REQUIRED",
        "Complete onboarding before using the game.",
      );
    return owner;
  }
  private date(ownerId: string, supplied?: string) {
    const owner = this.owner(ownerId);
    return (
      supplied ?? this.calendar.localDate(this.clock.now(), owner.timezone)
    );
  }
  dailyPlan(ownerId: string, input: DailyPlanInput) {
    const localDate = this.date(ownerId, input.localDate);
    const context = this.game.gameMasterContext(
      ownerId,
      localDate,
      input.capacityOverride,
    );
    return this.game.savePlan(
      ownerId,
      localDate,
      this.clock.now().toISOString(),
      this.generator.generate(context),
      context,
    );
  }
  listMissions(ownerId: string, date?: string) {
    return this.game.listMissions(ownerId, this.date(ownerId, date));
  }
  createMission(ownerId: string, input: CreateMissionInput) {
    return this.game.createMission(
      ownerId,
      this.date(ownerId, input.localDate),
      input,
      this.clock.now().toISOString(),
    );
  }
  updateMission(ownerId: string, id: string, input: UpdateMissionInput) {
    this.owner(ownerId);
    return this.game.updateMission(
      ownerId,
      id,
      input,
      this.clock.now().toISOString(),
    );
  }
  completeMission(ownerId: string, id: string, key?: string) {
    this.owner(ownerId);
    return this.game.completeMission(
      ownerId,
      id,
      key,
      this.clock.now().toISOString(),
    );
  }
  listQuests(ownerId: string, date?: string) {
    this.owner(ownerId);
    return this.game.listQuests(ownerId, date);
  }
  streak(ownerId: string, date?: string) {
    return this.game.streak(ownerId, this.date(ownerId, date));
  }
  programSummary(ownerId: string, date?: string) {
    return this.game.programSummary(ownerId, this.date(ownerId, date));
  }
  listChapters(ownerId: string) {
    return this.game.listChapters(ownerId, this.date(ownerId));
  }
  getChapter(ownerId: string, id: string) {
    return this.game.getChapter(ownerId, id, this.date(ownerId));
  }
  createChapter(ownerId: string, input: CreateChapterInput) {
    this.owner(ownerId);
    return this.game.createChapter(
      ownerId,
      input,
      this.clock.now().toISOString(),
    );
  }
  updateChapter(ownerId: string, id: string, input: UpdateChapterInput) {
    this.owner(ownerId);
    return this.game.updateChapter(
      ownerId,
      id,
      input,
      this.clock.now().toISOString(),
    );
  }
  achievements(ownerId: string) {
    this.owner(ownerId);
    return this.game.listAchievements(ownerId);
  }
  listRewards(ownerId: string) {
    this.owner(ownerId);
    return this.game.listRewards(ownerId);
  }
  createReward(ownerId: string, input: CreateRewardInput) {
    this.owner(ownerId);
    return this.game.createReward(
      ownerId,
      input,
      this.clock.now().toISOString(),
    );
  }
  updateReward(ownerId: string, id: string, input: UpdateRewardInput) {
    this.owner(ownerId);
    return this.game.updateReward(
      ownerId,
      id,
      input,
      this.clock.now().toISOString(),
    );
  }
  redeemReward(ownerId: string, id: string, date?: string) {
    return this.game.redeemReward(
      ownerId,
      id,
      this.date(ownerId, date),
      this.clock.now().toISOString(),
    );
  }
  listAcademics(ownerId: string) {
    this.owner(ownerId);
    return this.game.listAcademics(ownerId);
  }
  getAcademic(ownerId: string, id: string) {
    this.owner(ownerId);
    return this.game.getAcademic(ownerId, id);
  }
  createAcademic(ownerId: string, input: CreateAcademicInput) {
    this.owner(ownerId);
    return this.game.createAcademic(
      ownerId,
      input,
      this.clock.now().toISOString(),
    );
  }
  updateAcademic(ownerId: string, id: string, input: UpdateAcademicInput) {
    this.owner(ownerId);
    return this.game.updateAcademic(
      ownerId,
      id,
      input,
      this.clock.now().toISOString(),
    );
  }
  deleteAcademic(ownerId: string, id: string) {
    this.owner(ownerId);
    this.game.deleteAcademic(ownerId, id);
  }
}
