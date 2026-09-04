import { describe, expect, it } from "vitest";
import { DeterministicBriefingGenerator } from "@/domain/briefing/generator";

const input = {
  ownerLocalDate: "2026-09-03",
  capacity: "normal" as const,
  activeChapter: { id: "chapter-1", title: "Synthetic chapter" },
  unresolvedQuestIds: ["old-2", "old-1"],
  proposedQuests: [
    { id: "q2", title: "Second", milestoneOrder: 2, dormantOnly: false },
    { id: "q1", title: "First", milestoneOrder: 1, dormantOnly: false },
    { id: "q0", title: "Dormant", milestoneOrder: 0, dormantOnly: true },
  ],
  activeGuardrails: [{ id: "g1", statement: "Protect rest" }],
};
describe("deterministic briefing", () => {
  it("is stable, capacity bounded, and excludes dormant-only quests", () => {
    const generator = new DeterministicBriefingGenerator();
    expect(generator.generate(input)).toEqual(
      generator.generate({
        ...input,
        unresolvedQuestIds: [...input.unresolvedQuestIds].reverse(),
      }),
    );
    const result = generator.generate(input);
    expect(result.kind).toBe("deterministic");
    expect(result.main?.questId).toBe("q1");
    expect(result.sides.map((side) => side.questId)).toEqual(["q2"]);
  });
});
