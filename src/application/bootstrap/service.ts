import type {
  CharacterReadRepository,
  OwnerRepository,
} from "@/application/ports/persistence";
import type { CalendarService, Clock } from "@/application/ports/time";

export class BootstrapService {
  constructor(
    private readonly owners: OwnerRepository,
    private readonly character: CharacterReadRepository,
    private readonly clock: Clock,
    private readonly calendar: CalendarService,
    private readonly setupMode: "disabled" | "local" = "disabled",
  ) {}

  publicStatus() {
    return {
      authenticated: false as const,
      hasOwner: this.owners.count() > 0,
      setupMode: this.setupMode,
      aiMode: "disabled" as const,
    };
  }

  get(ownerId: string) {
    const owner = this.owners.findById(ownerId);
    if (!owner) return null;
    const activeChapter = this.character.findActiveChapter(ownerId);
    return {
      authenticated: true as const,
      hasOwner: true as const,
      setupMode: this.setupMode,
      owner: {
        id: owner.id,
        displayName: owner.displayName,
        timezone: owner.timezone,
        setupCompleted: owner.setupCompleted,
        version: owner.version,
      },
      localDate: this.calendar.localDate(this.clock.now(), owner.timezone),
      aiMode: "disabled" as const,
      navigation: owner.setupCompleted
        ? (["today", "character", "chronicle"] as const)
        : (["onboarding"] as const),
      setup: {
        completed: owner.setupCompleted,
        hasActiveChapter: Boolean(activeChapter),
      },
      activeChapter: activeChapter
        ? { id: activeChapter.id, title: activeChapter.title }
        : null,
    };
  }
}
