import { describe, expect, it } from "vitest";
import { arcCompletionTransition, arcDayCounter } from "@/domain/game/arc";
import {
  computeStreak,
  dayQualifies,
  type StreakDay,
} from "@/domain/game/streak";
import { consistencyPercent } from "@/domain/game/policy";

const day = (
  localDate: string,
  completedMission = false,
  deliberateRest = false,
): StreakDay => ({ localDate, completedMission, deliberateRest });

describe("streak policy", () => {
  it("qualifies completed missions and deliberate rest, but not unaccounted days", () => {
    expect(dayQualifies(day("2026-09-01", true))).toBe(true);
    expect(dayQualifies(day("2026-09-01", false, true))).toBe(true);
    expect(dayQualifies(day("2026-09-01"))).toBe(false);
  });

  it("lets today remain in progress and breaks only across an earlier gap", () => {
    const days = [
      day("2026-09-01", true),
      day("2026-09-02", false, true),
      day("2026-09-04", true),
      day("2026-09-05", false, true),
    ];
    expect(computeStreak(days, "2026-09-05")).toEqual({
      current: 2,
      longest: 2,
      asOfDate: "2026-09-05",
    });
    expect(computeStreak(days, "2026-09-06").current).toBe(2);
    expect(computeStreak(days, "2026-09-07").current).toBe(0);
  });

  it("keeps the longest historical run after the current streak breaks", () => {
    const days = [
      day("2026-09-01", true),
      day("2026-09-02", true),
      day("2026-09-03", true),
      day("2026-09-06", true),
    ];
    expect(computeStreak(days, "2026-09-06")).toMatchObject({
      current: 1,
      longest: 3,
    });
  });

  it("feeds the same computed streak into consistencyPercent so XP cannot disagree with the displayed streak", () => {
    const days = [
      day("2026-09-01", true),
      day("2026-09-02", false, true),
      day("2026-09-03", true),
    ];
    const streak = computeStreak(days, "2026-09-03");
    expect(streak.current).toBe(3);
    expect(consistencyPercent(streak)).toBe(115);

    const brokenStreak = computeStreak(days, "2026-09-06");
    expect(brokenStreak.current).toBe(0);
    expect(consistencyPercent(brokenStreak)).toBe(100);
  });
});

describe("arc day counter", () => {
  it("counts inclusively and clamps before and after the arc", () => {
    expect(arcDayCounter("2026-09-01", 66, "2026-08-20")).toEqual({
      day: 1,
      of: 66,
    });
    expect(arcDayCounter("2026-09-01", 66, "2026-09-23")).toEqual({
      day: 23,
      of: 66,
    });
    expect(arcDayCounter("2026-09-01", 66, "2027-01-01")).toEqual({
      day: 66,
      of: 66,
    });
  });
});

describe("arc completion transition", () => {
  it("records the chronicle outcome, unlocks the achievement, and offers the next arc", () => {
    expect(arcCompletionTransition("active", "completed")).toEqual({
      chronicleOutcome: "completed",
      achievementKey: "arc_completed",
      offerNextArc: true,
    });
  });

  it("does not repeat completion effects or emit them for other transitions", () => {
    expect(arcCompletionTransition("completed", "completed")).toBeNull();
    expect(arcCompletionTransition("draft", "completed")).toBeNull();
    expect(arcCompletionTransition("draft", "active")).toBeNull();
    expect(arcCompletionTransition("active", "abandoned")).toBeNull();
  });
});
