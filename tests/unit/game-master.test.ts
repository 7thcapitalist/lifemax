import { describe, expect, it } from "vitest";
import { DeterministicMissionGenerator } from "@/domain/game-master/generator";
import type { GameMasterContext } from "@/lib/game-types";
const unknown = { status: "unknown" as const, value: null };
const known = <T>(value: T) => ({ status: "known" as const, value });

const baseContext = (): GameMasterContext => ({
  ownerLocalDate: "2026-09-09",
  becomingStatement: unknown,
  attributes: known([
    { id: "a1", name: "Discipline", emphasis: "active" as const, sortOrder: 1 },
    { id: "a2", name: "Health", emphasis: "active" as const, sortOrder: 2 },
  ]),
  activeChapter: unknown,
  activeGuardrails: known([]),
  recentActivity: unknown,
  todayCheckIn: known({ capacity: "normal" as const, reflection: null }),
});

describe("deterministic game master", () => {
  it("preserves unknown context and emits a ranked exploratory mission without network", () => {
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
      kind: "exploration",
      attributeIds: [],
    });
    expect(one.proposals[0]!.rationale).toContain("Unknown context:");
  });

  // AC #4 requires the plan to be derived from identity and recent activity.
  // Both were previously accepted and then never read, so opposite inputs
  // produced byte-identical proposals. These lock that shut.
  it("derives rationale from the becoming statement", () => {
    const generator = new DeterministicMissionGenerator();
    const withIdentity = generator.generate({
      ...baseContext(),
      becomingStatement: known("a founder who ships"),
    });
    const withOther = generator.generate({
      ...baseContext(),
      becomingStatement: known("an athlete who recovers well"),
    });

    expect(withIdentity.proposals[0]!.rationale).toContain(
      "a founder who ships",
    );
    expect(withOther.proposals[0]!.rationale).toContain(
      "an athlete who recovers well",
    );
    expect(withIdentity.proposals).not.toEqual(withOther.proposals);
  });

  it("does not invent an identity when the becoming statement is unknown", () => {
    const generator = new DeterministicMissionGenerator();
    const plan = generator.generate(baseContext());
    for (const proposal of plan.proposals)
      expect(proposal.rationale).not.toContain("who you are becoming");
    expect(plan.proposals[0]!.rationale).toContain("becomingStatement");
  });

  it("surfaces the neglected attribute first based on recent activity", () => {
    const generator = new DeterministicMissionGenerator();
    // Discipline worked repeatedly, Health untouched -> Health should lead.
    const disciplineHeavy = generator.generate({
      ...baseContext(),
      recentActivity: known([
        {
          localDate: "2026-09-08",
          kind: "progress" as const,
          completed: true,
          attributeIds: ["a1"],
        },
        {
          localDate: "2026-09-07",
          kind: "rest" as const,
          completed: true,
          attributeIds: ["a1"],
        },
      ]),
    });
    expect(disciplineHeavy.proposals[0]!.title).toBe("Advance Health");
    expect(disciplineHeavy.proposals[0]!.rationale).toContain(
      "No recently completed mission touched it",
    );

    // Mirror image: Health worked, Discipline untouched -> Discipline leads.
    const healthHeavy = generator.generate({
      ...baseContext(),
      recentActivity: known([
        {
          localDate: "2026-09-08",
          kind: "progress" as const,
          completed: true,
          attributeIds: ["a2"],
        },
        {
          localDate: "2026-09-07",
          kind: "rest" as const,
          completed: true,
          attributeIds: ["a2"],
        },
      ]),
    });
    expect(healthHeavy.proposals[0]!.title).toBe("Advance Discipline");
    expect(disciplineHeavy.proposals).not.toEqual(healthHeavy.proposals);
  });

  it("proposes recovery when recent activity is sustained work with no rest", () => {
    const generator = new DeterministicMissionGenerator();
    const plan = generator.generate({
      ...baseContext(),
      recentActivity: known(
        ["2026-09-08", "2026-09-07", "2026-09-06"].map((localDate) => ({
          localDate,
          kind: "progress" as const,
          completed: true,
          attributeIds: ["a1"],
        })),
      ),
    });
    expect(plan.proposals[0]).toMatchObject({ rank: 1, kind: "rest" });
    expect(plan.proposals[0]!.rationale).toContain("no recovery");
  });

  it.each([
    ["sleep", "rest"],
    ["recovery", "rest"],
    ["connection", "relationship"],
    ["novelty", "exploration"],
  ] as const)(
    "maps an underserved %s guardrail to a %s mission",
    (category, kind) => {
      const plan = new DeterministicMissionGenerator().generate({
        ...baseContext(),
        activeGuardrails: known([
          { id: `g-${category}`, category, statement: `Protect ${category}` },
        ]),
        recentActivity: known([]),
      });

      expect(plan.proposals[0]).toMatchObject({
        rank: 1,
        kind,
        citations: [`g-${category}`],
      });
      expect(plan.proposals[0]!.rationale).toContain(`Protect ${category}`);
    },
  );

  it("derives a custom protective mission from the user's statement", () => {
    const withGuardrail = (statement: string) =>
      new DeterministicMissionGenerator().generate({
        ...baseContext(),
        activeGuardrails: known([
          { id: "g-custom", category: "custom", statement },
        ]),
        recentActivity: known([]),
      });
    const family = withGuardrail("Protect family time");
    const solitude = withGuardrail("Protect solitude");

    expect(family.proposals[0]).toMatchObject({
      kind: "exploration",
      citations: ["g-custom"],
    });
    expect(family.proposals[0]!.rationale).toContain("Protect family time");
    expect(solitude.proposals[0]!.rationale).toContain("Protect solitude");
    expect(family.proposals).not.toEqual(solitude.proposals);
  });

  it("uses exploration when no attributes or protective inputs are known", () => {
    const plan = new DeterministicMissionGenerator().generate({
      ...baseContext(),
      attributes: unknown,
      activeGuardrails: known([]),
    });
    expect(plan.proposals).toHaveLength(1);
    expect(plan.proposals[0]).toMatchObject({
      rank: 1,
      kind: "exploration",
      attributeIds: [],
    });
  });

  it("ignores incomplete activity and stays deterministic", () => {
    const generator = new DeterministicMissionGenerator();
    const context: GameMasterContext = {
      ...baseContext(),
      becomingStatement: known("someone who follows through"),
      recentActivity: known([
        {
          localDate: "2026-09-08",
          kind: "progress" as const,
          completed: false,
          attributeIds: ["a1"],
        },
      ]),
    };
    expect(generator.generate(context)).toEqual(generator.generate(context));
    // An abandoned mission is not progress, so ordering falls back to sortOrder.
    expect(generator.generate(context).proposals[0]!.title).toBe(
      "Advance Discipline",
    );
  });
});
