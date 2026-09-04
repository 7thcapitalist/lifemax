import type {
  OwnerRepository,
  TransactionPort,
} from "@/application/ports/persistence";
import type { Clock } from "@/application/ports/time";
import type { OnboardingInput } from "@/contracts/http";
import { assertOnboardingCharacter } from "@/domain/character/invariants";
import { DomainError } from "@/domain/shared/errors";

export class OnboardingService {
  constructor(
    private readonly owners: OwnerRepository,
    private readonly transactions: TransactionPort,
    private readonly clock: Clock,
  ) {}

  complete(ownerId: string, input: OnboardingInput): void {
    assertOnboardingCharacter(input.aspects);
    if (input.northStars.length > 3)
      throw new DomainError(
        "NORTH_STAR_LIMIT",
        "At most three North Stars may be active.",
      );
    const start = new Date(`${input.chapter.startDate}T00:00:00Z`);
    const end = new Date(`${input.chapter.endDate}T00:00:00Z`);
    const duration = (end.getTime() - start.getTime()) / 86_400_000;
    if (duration < 42 || duration > 84)
      throw new DomainError(
        "CHAPTER_DURATION",
        "An active chapter must span 6–12 weeks.",
      );
    const now = this.clock.now().toISOString();
    this.transactions.run(() => {
      const owner = this.owners.findById(ownerId);
      if (!owner) throw new DomainError("OWNER_NOT_FOUND", "Owner not found.");
      if (owner.setupCompleted)
        throw new DomainError(
          "ONBOARDING_COMPLETE",
          "Onboarding is already complete.",
        );
      this.owners.completeOnboarding(ownerId, input, now);
    });
  }
}
