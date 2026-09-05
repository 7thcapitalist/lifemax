import type { PlanningRepository } from "@/application/ports/persistence";

export class ChronicleService {
  constructor(private readonly planning: PlanningRepository) {}

  list(ownerId: string, cursor?: string, limit = 20) {
    const pageSize = Math.min(Math.max(limit, 1), 50);
    return this.planning.listOutcomes(ownerId, pageSize, cursor);
  }
}
