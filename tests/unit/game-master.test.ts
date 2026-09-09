import { describe, expect, it } from "vitest";
import { DeterministicMissionGenerator } from "@/domain/game-master/generator";
import type { GameMasterContext } from "@/lib/game-types";
const unknown = { status: "unknown" as const, value: null };
describe("deterministic game master", () => {
  it("preserves unknown context and emits a ranked protective mission without network", () => {
    const context: GameMasterContext = {
      ownerLocalDate: "2026-09-09",
      becomingStatement: unknown,
      attributes: unknown,
      activeChapter: unknown,
      activeGuardrails: unknown,
      recentActivity: unknown,
      todayCheckIn: unknown,
    };
    const generator = new DeterministicMissionGenerator();
    const one = generator.generate(context),
      two = generator.generate(context);
    expect(one).toEqual(two);
    expect(one.proposals).toHaveLength(1);
    expect(one.proposals[0]).toMatchObject({
      rank: 1,
      kind: "rest",
      attributeIds: [],
    });
    expect(one.proposals[0]!.rationale).toContain("Unknown context:");
  });
});
