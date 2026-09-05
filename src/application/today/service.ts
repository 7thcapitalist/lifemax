import type {
  CharacterReadRepository,
  OwnerRepository,
  PlanningRepository,
} from "@/application/ports/persistence";
import type { CalendarService, Clock } from "@/application/ports/time";
import { DomainError } from "@/domain/shared/errors";

function daysBetween(earlier: string, later: string): number {
  const start = Date.parse(`${earlier}T00:00:00Z`);
  const end = Date.parse(`${later}T00:00:00Z`);
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

export class TodayService {
  constructor(
    private readonly owners: OwnerRepository,
    private readonly character: CharacterReadRepository,
    private readonly planning: PlanningRepository,
    private readonly clock: Clock,
    private readonly calendar: CalendarService,
  ) {}

  get(ownerId: string, date?: string) {
    const owner = this.owners.findById(ownerId);
    if (!owner) throw new DomainError("OWNER_NOT_FOUND", "Owner not found.");
    const localDate =
      date ?? this.calendar.localDate(this.clock.now(), owner.timezone);
    const unresolvedPrior = this.planning.listUnresolvedAcceptedBefore(
      ownerId,
      localDate,
    );
    const checkIn = this.planning.findCheckIn(ownerId, localDate);
    const briefing = this.planning.findLatestBriefing(ownerId, localDate);
    const quests = this.planning.listQuestsForDate(ownerId, localDate);
    const lastActivityDate = this.planning.findLastActivityDate(ownerId);
    const gapDays = lastActivityDate
      ? daysBetween(lastActivityDate, localDate)
      : null;
    const missedDayGap =
      gapDays !== null && gapDays > 1
        ? {
            daysSinceLastActivity: gapDays,
            message: `${gapDays} days since your last activity. Continuing from current priorities.`,
          }
        : null;

    return {
      localDate,
      unresolvedPriorQuests: unresolvedPrior,
      checkIn: checkIn ?? null,
      briefing: briefing ?? null,
      quests,
      missedDayGap,
      activeChapter: this.character.findActiveChapter(ownerId) ?? null,
    };
  }
}
