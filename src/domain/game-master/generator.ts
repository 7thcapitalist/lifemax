import { createHash } from "node:crypto";
import type {
  DailyPlanResponse,
  GameMasterContext,
  MissionProposal,
} from "@/lib/game-types";

export type GeneratedPlan = Pick<
  DailyPlanResponse,
  "planFingerprint" | "generatorVersion" | "proposals"
>;
export interface MissionGenerator {
  readonly kind: "deterministic";
  generate(context: GameMasterContext): GeneratedPlan;
}

function unknowns(context: GameMasterContext): string[] {
  return Object.entries(context)
    .filter(
      ([key, value]) =>
        key !== "ownerLocalDate" &&
        typeof value === "object" &&
        value?.status === "unknown",
    )
    .map(([key]) => key);
}
export class DeterministicMissionGenerator implements MissionGenerator {
  readonly kind = "deterministic" as const;
  generate(context: GameMasterContext): GeneratedPlan {
    const attributes =
      context.attributes.status === "known"
        ? [...context.attributes.value].sort(
            (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
          )
        : [];
    const capacity =
      context.todayCheckIn.status === "known"
        ? context.todayCheckIn.value.capacity
        : null;
    const protective =
      capacity === "low" ||
      (context.activeGuardrails.status === "known" &&
        context.activeGuardrails.value.some((g) =>
          ["sleep", "connection", "recovery", "novelty"].includes(g.category),
        ));
    const missing = unknowns(context);
    const rationaleSuffix = missing.length
      ? ` Unknown context: ${missing.join(", ")}.`
      : "";
    const proposals: MissionProposal[] = [];
    if (protective || !attributes.length)
      proposals.push({
        rank: 1,
        title: "Protect recovery",
        doneCondition: "Take a deliberate 20-minute recovery pause.",
        size: "small",
        kind: "rest",
        attributeIds: attributes[0] ? [attributes[0].id] : [],
        questId: null,
        chapterId:
          context.activeChapter.status === "known"
            ? context.activeChapter.value.id
            : null,
        rationale: `Capacity and guardrails make recovery eligible.${rationaleSuffix}`,
        citations:
          context.activeGuardrails.status === "known"
            ? context.activeGuardrails.value.map((g) => g.id)
            : [],
      });
    for (const attribute of attributes.slice(
      0,
      Math.max(0, 3 - proposals.length),
    ))
      proposals.push({
        rank: proposals.length + 1,
        title: `Advance ${attribute.name}`,
        doneCondition: `Complete one concrete action for ${attribute.name}.`,
        size: capacity === "high" ? "major" : "standard",
        kind: "progress",
        attributeIds: [attribute.id],
        questId: null,
        chapterId:
          context.activeChapter.status === "known"
            ? context.activeChapter.value.id
            : null,
        rationale: `Selected from the user-defined ${attribute.name} attribute.${rationaleSuffix}`,
        citations: [
          attribute.id,
          ...(context.activeChapter.status === "known"
            ? [context.activeChapter.value.id]
            : []),
        ],
      });
    if (!proposals.length)
      proposals.push({
        rank: 1,
        title: "Explore what matters today",
        doneCondition:
          "Spend 10 minutes identifying one meaningful next action.",
        size: "small",
        kind: "exploration",
        attributeIds: [],
        questId: null,
        chapterId: null,
        rationale: `No linked attributes were available.${rationaleSuffix}`,
        citations: [],
      });
    return {
      generatorVersion: "deterministic-game-v1",
      planFingerprint: createHash("sha256")
        .update(JSON.stringify(context))
        .digest("hex"),
      proposals,
    };
  }
}
