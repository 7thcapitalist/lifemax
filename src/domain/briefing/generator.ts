import { createHash } from "node:crypto";

export type Capacity = "low" | "normal" | "high";
export type BriefingInput = {
  ownerLocalDate: string;
  capacity: Capacity;
  activeChapter: { id: string; title: string } | null;
  unresolvedQuestIds: string[];
  proposedQuests: Array<{
    id: string;
    title: string;
    milestoneOrder: number;
    dormantOnly: boolean;
  }>;
  activeGuardrails: Array<{ id: string; statement: string }>;
};
export type BriefingDraft = {
  kind: "deterministic";
  version: "deterministic-v1";
  fingerprint: string;
  mirror: string;
  main: { questId: string; title: string } | null;
  sides: Array<{ questId: string; title: string }>;
  guardrail: { id: string; statement: string } | null;
};

function canonical(input: BriefingInput): string {
  return JSON.stringify({
    ...input,
    unresolvedQuestIds: [...input.unresolvedQuestIds].sort(),
    proposedQuests: [...input.proposedQuests].sort(
      (a, b) => a.milestoneOrder - b.milestoneOrder || a.id.localeCompare(b.id),
    ),
    activeGuardrails: [...input.activeGuardrails].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
  });
}

export class DeterministicBriefingGenerator {
  readonly kind = "deterministic" as const;

  generate(input: BriefingInput): BriefingDraft {
    const serialized = canonical(input);
    const eligible = [...input.proposedQuests]
      .filter((quest) => !quest.dormantOnly)
      .sort(
        (a, b) =>
          a.milestoneOrder - b.milestoneOrder || a.id.localeCompare(b.id),
      );
    const budget =
      input.capacity === "low" ? 1 : input.capacity === "normal" ? 2 : 3;
    const selected = eligible.slice(0, budget);
    return {
      kind: this.kind,
      version: "deterministic-v1",
      fingerprint: createHash("sha256").update(serialized).digest("hex"),
      mirror: `${input.ownerLocalDate}: ${input.activeChapter ? input.activeChapter.title : "No active chapter"}; ${input.capacity} capacity; ${input.unresolvedQuestIds.length} unresolved.`,
      main: selected[0]
        ? { questId: selected[0].id, title: selected[0].title }
        : null,
      sides: selected
        .slice(1)
        .map((quest) => ({ questId: quest.id, title: quest.title })),
      guardrail: input.activeGuardrails[0] ?? null,
    };
  }
}
