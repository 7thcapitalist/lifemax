import type { OwnerRepository } from "@/application/ports/persistence";
import type { CalendarService, Clock } from "@/application/ports/time";

export class BootstrapService {
  constructor(
    private readonly owners: OwnerRepository,
    private readonly clock: Clock,
    private readonly calendar: CalendarService,
  ) {}

  get(ownerId: string) {
    const owner = this.owners.findById(ownerId);
    if (!owner) return null;
    return {
      owner,
      localDate: this.calendar.localDate(this.clock.now(), owner.timezone),
      aiMode: "disabled" as const,
      navigation: ["today", "character", "chronicle"] as const,
    };
  }
}
