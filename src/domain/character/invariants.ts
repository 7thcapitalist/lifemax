import { DomainError } from "@/domain/shared/errors";

export type AspectDraft = {
  name: string;
  definition: string;
  desiredIdentity: string;
  emphasis: "active" | "maintenance" | "dormant";
};

export type NorthStarDraft = { status: "active" | "archived" };
export type ChapterDraft = {
  status: "draft" | "active" | "completed" | "abandoned";
};

export function assertOnboardingCharacter(aspects: AspectDraft[]): void {
  if (aspects.length < 4 || aspects.length > 6) {
    throw new DomainError(
      "ASPECT_COUNT",
      "Completed onboarding requires four to six aspects.",
    );
  }
  if (
    aspects.some(
      (aspect) =>
        !aspect.name.trim() ||
        !aspect.definition.trim() ||
        !aspect.desiredIdentity.trim(),
    )
  ) {
    throw new DomainError(
      "ASPECT_FIELDS",
      "Every aspect needs a name, definition, and desired identity.",
    );
  }
  if (aspects.every((aspect) => aspect.emphasis === "dormant")) {
    throw new DomainError(
      "ASPECT_EMPHASIS",
      "At least one aspect must not be dormant.",
    );
  }
}

export function assertNorthStars(stars: NorthStarDraft[]): void {
  if (stars.filter((star) => star.status === "active").length > 3) {
    throw new DomainError(
      "NORTH_STAR_LIMIT",
      "At most three North Stars may be active.",
    );
  }
}

export function assertOneActiveChapter(chapters: ChapterDraft[]): void {
  if (chapters.filter((chapter) => chapter.status === "active").length > 1) {
    throw new DomainError(
      "ACTIVE_CHAPTER_LIMIT",
      "Only one chapter may be active.",
    );
  }
}
