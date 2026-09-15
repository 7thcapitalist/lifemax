import { describe, expect, it } from "vitest";
import {
  alignmentPercent,
  applyDailyCap,
  applyXp,
  coinAward,
  consistencyPercent,
  computeMissionXp,
  diminishingPercent,
  splitXp,
} from "@/domain/game/policy";

describe("game XP and coin policy", () => {
  it("applies diminishing returns independently", () => {
    expect([0, 1, 2, 3, 8].map(diminishingPercent)).toEqual([
      100, 50, 25, 0, 0,
    ]);
  });
  it("applies stretch, alignment, consistency and one final floor", () => {
    expect(
      computeMissionXp({
        size: "major",
        priorSameFamily: 0,
        stretch: true,
        alignmentPercent: 125,
        consecutivePriorDays: 5,
      }).total,
    ).toBe(68);
  });
  it("applies the stretch modifier independently", () => {
    const baseline = computeMissionXp({
      size: "standard",
      priorSameFamily: 0,
      stretch: false,
      alignmentPercent: 100,
      consecutivePriorDays: 0,
    });
    const stretch = computeMissionXp({
      size: "standard",
      priorSameFamily: 0,
      stretch: true,
      alignmentPercent: 100,
      consecutivePriorDays: 0,
    });
    expect([baseline.total, stretch.total]).toEqual([20, 25]);
  });
  it("caps the consistency modifier at five prior consecutive days", () => {
    expect([
      consistencyPercent({ current: 0 }),
      consistencyPercent({ current: 3 }),
      consistencyPercent({ current: 9 }),
    ]).toEqual([100, 115, 125]);
  });
  it("chooses one alignment tier", () => {
    expect(
      alignmentPercent({
        linkedToActiveChapterOrQuest: false,
        anyActive: false,
        allDormant: true,
      }),
    ).toBe(75);
    expect(
      alignmentPercent({
        linkedToActiveChapterOrQuest: true,
        anyActive: true,
        allDormant: false,
      }),
    ).toBe(125);
  });
  it("caps daily XP and splits deterministic remainders", () => {
    expect(applyDailyCap(68, 150)).toBe(50);
    expect(applyDailyCap(10, 200)).toBe(0);
    expect(splitXp(5, ["a", "b"])).toEqual([
      { aspectId: "a", points: 3 },
      { aspectId: "b", points: 2 },
    ]);
  });
  it("carries XP overflow through levels", () => {
    expect(applyXp(1, 90, 320)).toEqual({
      level: 3,
      xpIntoLevel: 110,
      totalXpDelta: 320,
    });
  });
  it("keeps coin awards independent from modifiers", () => {
    expect([
      coinAward("small"),
      coinAward("standard"),
      coinAward("major"),
    ]).toEqual([1, 3, 5]);
  });
});
