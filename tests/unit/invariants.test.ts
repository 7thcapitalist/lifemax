import { describe, expect, it } from "vitest";
import {
  assertNorthStars,
  assertOneActiveChapter,
  assertOnboardingCharacter,
} from "@/domain/character/invariants";
import {
  assertCanResolve,
  assertDailyAcceptedQuestLimit,
  assertQuestAcceptable,
} from "@/domain/planning/invariants";

const aspect = {
  name: "Builder",
  definition: "Build useful things",
  desiredIdentity: "A careful builder",
  emphasis: "active" as const,
};
describe("core invariants", () => {
  it("requires four to six complete aspects and a non-dormant aspect", () => {
    expect(() =>
      assertOnboardingCharacter(Array(4).fill(aspect)),
    ).not.toThrow();
    expect(() => assertOnboardingCharacter(Array(3).fill(aspect))).toThrowError(
      /four to six/,
    );
    expect(() => assertOnboardingCharacter(Array(7).fill(aspect))).toThrowError(
      /four to six/,
    );
    expect(() =>
      assertOnboardingCharacter(
        Array(4).fill({ ...aspect, emphasis: "dormant" }),
      ),
    ).toThrowError(/not be dormant/);
  });
  it("caps active North Stars and chapters", () => {
    expect(() =>
      assertNorthStars(Array(4).fill({ status: "active" })),
    ).toThrowError(/three/);
    expect(() =>
      assertOneActiveChapter([{ status: "active" }, { status: "active" }]),
    ).toThrowError(/one chapter/i);
  });
  it("requires bounded linked quests and applies daily role caps", () => {
    expect(() =>
      assertQuestAcceptable({
        title: "Ship",
        doneCondition: "Merged",
        reason: "Learn",
        aspectIds: [],
      }),
    ).toThrowError(/link/);
    const quests = Array.from({ length: 4 }, () => ({
      localDate: "2026-09-03",
      status: "accepted" as const,
      role: "side" as const,
    }));
    expect(() =>
      assertDailyAcceptedQuestLimit(quests, "2026-09-03"),
    ).toThrowError(/three/);
    expect(() =>
      assertDailyAcceptedQuestLimit(
        [
          { localDate: "2026-09-03", status: "accepted", role: "main" },
          { localDate: "2026-09-03", status: "accepted", role: "main" },
        ],
        "2026-09-03",
      ),
    ).toThrowError(/one accepted quest/);
  });
  it("allows exactly one terminal outcome from accepted", () => {
    expect(() => assertCanResolve("accepted", false)).not.toThrow();
    expect(() => assertCanResolve("completed", true)).toThrowError(
      /unresolved/,
    );
  });
});
