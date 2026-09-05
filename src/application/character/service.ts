import type {
  CharacterReadRepository,
  OwnerRepository,
} from "@/application/ports/persistence";
import { DomainError } from "@/domain/shared/errors";

export class CharacterService {
  constructor(
    private readonly owners: OwnerRepository,
    private readonly character: CharacterReadRepository,
  ) {}

  get(ownerId: string) {
    const owner = this.owners.findById(ownerId);
    if (!owner) throw new DomainError("OWNER_NOT_FOUND", "Owner not found.");
    const chapter = this.character.findActiveChapter(ownerId);
    return {
      becomingStatement: owner.becomingStatement,
      aspects: this.character.listAspects(ownerId),
      northStars: this.character.listNorthStars(ownerId),
      activeChapter: chapter
        ? {
            ...chapter,
            milestones: this.character.listMilestones(ownerId, chapter.id),
          }
        : null,
      guardrails: this.character.listGuardrails(ownerId),
    };
  }
}
