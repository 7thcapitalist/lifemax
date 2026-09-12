import { DomainError } from "@/domain/shared/errors";

export function assertRedeemable(balance: number, cost: number): void {
  if (balance < cost)
    throw new DomainError(
      "INSUFFICIENT_COINS",
      "The reward costs more coins than the current balance.",
    );
}

export function assertMissionAttributes(
  kind: string,
  attributeIds: readonly string[],
): void {
  if (kind === "progress" && attributeIds.length === 0)
    throw new DomainError(
      "MISSION_ATTRIBUTE_REQUIRED",
      "Progress missions require an attribute.",
    );
}

export function assertChapterTransition(from: string, to: string): void {
  if (from === to) return;
  const allowed =
    (from === "draft" && (to === "active" || to === "abandoned")) ||
    (from === "active" && (to === "completed" || to === "abandoned"));
  if (!allowed)
    throw new DomainError("CHAPTER_TRANSITION", "Invalid chapter transition.");
}
