import type { Streak } from "@/domain/game/streak";

export const POLICY_VERSION = "game-v1";
export const DAILY_XP_CAP = 200;
export type MissionSize = "small" | "standard" | "major";

export type XpBreakdown = {
  policyVersion: typeof POLICY_VERSION;
  base: number;
  diminishingPercent: number;
  stretchPercent: number;
  alignmentPercent: number;
  consistencyPercent: number;
  uncapped: number;
};

export function baseXp(size: MissionSize): number {
  return { small: 10, standard: 20, major: 35 }[size];
}
export function diminishingPercent(prior: number): number {
  return prior <= 0 ? 100 : prior === 1 ? 50 : prior === 2 ? 25 : 0;
}
export function alignmentPercent(input: {
  linkedToActiveChapterOrQuest: boolean;
  anyActive: boolean;
  allDormant: boolean;
}): number {
  return input.linkedToActiveChapterOrQuest || input.anyActive
    ? 125
    : input.allDormant
      ? 75
      : 100;
}
export function consistencyPercent(streak: Pick<Streak, "current">): number;
/** @deprecated Pass the computed streak object. */
export function consistencyPercent(priorDays: number): number;
export function consistencyPercent(
  streak: Pick<Streak, "current"> | number,
): number {
  const current = typeof streak === "number" ? streak : streak.current;
  return 100 + 5 * Math.min(5, Math.max(0, current));
}
export function computeMissionXp(input: {
  size: MissionSize;
  priorSameFamily: number;
  stretch: boolean;
  alignmentPercent: number;
  streak?: Pick<Streak, "current">;
  /** @deprecated Pass the computed streak object. Kept for API compatibility. */
  consecutivePriorDays?: number;
}): { total: number; breakdown: XpBreakdown } {
  const base = baseXp(input.size);
  const diminishing = diminishingPercent(input.priorSameFamily);
  const stretch = input.stretch ? 125 : 100;
  const consistency = consistencyPercent(
    input.streak ?? { current: input.consecutivePriorDays ?? 0 },
  );
  const total = Math.floor(
    (base * diminishing * stretch * input.alignmentPercent * consistency) /
      100_000_000,
  );
  return {
    total,
    breakdown: {
      policyVersion: POLICY_VERSION,
      base,
      diminishingPercent: diminishing,
      stretchPercent: stretch,
      alignmentPercent: input.alignmentPercent,
      consistencyPercent: consistency,
      uncapped: total,
    },
  };
}
export function applyDailyCap(total: number, awarded: number): number {
  return Math.max(0, Math.min(total, DAILY_XP_CAP - awarded));
}
export function splitXp(total: number, sortedIds: string[]) {
  if (!sortedIds.length) return [];
  const each = Math.floor(total / sortedIds.length);
  const remainder = total % sortedIds.length;
  return sortedIds.map((aspectId, index) => ({
    aspectId,
    points: each + (index < remainder ? 1 : 0),
  }));
}
export function applyXp(level: number, xpIntoLevel: number, points: number) {
  let nextLevel = level;
  let xp = xpIntoLevel + points;
  while (xp >= 100 * nextLevel) {
    xp -= 100 * nextLevel;
    nextLevel += 1;
  }
  return { level: nextLevel, xpIntoLevel: xp, totalXpDelta: points };
}
export function coinAward(size: MissionSize): number {
  return { small: 1, standard: 3, major: 5 }[size];
}
