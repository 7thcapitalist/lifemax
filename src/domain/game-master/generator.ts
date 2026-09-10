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

// Sustained completed work with no recovery in the recent window. The product
// guardrail is explicit that the best mission is sometimes rest, so this is a
// first-class trigger rather than a tie-breaker.
const OVER_INDEX_THRESHOLD = 3;

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

// How many recently completed missions touched each attribute. Attributes with
// the fewest are the ones the user has been neglecting.
function completionsByAttribute(
  completed: ReadonlyArray<{ attributeIds: string[] }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of completed)
    for (const id of entry.attributeIds)
      counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

type KnownGuardrail = {
  id: string;
  category: string;
  statement: string;
};

function protectiveKind(category: string): MissionProposal["kind"] {
  if (category === "connection") return "relationship";
  if (category === "novelty") return "exploration";
  return "rest";
}

function protectiveCopy(
  kind: MissionProposal["kind"],
  customStatement?: string,
): {
  title: string;
  doneCondition: string;
} {
  if (customStatement)
    return {
      title: "Honor your guardrail",
      // Guardrail statements are already bounded owner input. Preserving the
      // exact wording avoids weakening or reversing meaning through inference.
      doneCondition: customStatement,
    };
  if (kind === "relationship")
    return {
      title: "Protect connection",
      doneCondition: "Make one deliberate act of connection.",
    };
  if (kind === "exploration")
    return {
      title: "Make room to explore",
      doneCondition:
        "Spend 20 minutes following curiosity without an outcome target.",
    };
  return {
    title: "Protect recovery",
    doneCondition: "Take a deliberate 20-minute recovery pause.",
  };
}

export class DeterministicMissionGenerator implements MissionGenerator {
  readonly kind = "deterministic" as const;
  generate(context: GameMasterContext): GeneratedPlan {
    // Narrow inline: a stored boolean does not narrow the ContextValue union.
    const completed =
      context.recentActivity.status === "known"
        ? context.recentActivity.value.filter((entry) => entry.completed)
        : [];
    const activityKnown = context.recentActivity.status === "known";
    const touched = completionsByAttribute(completed);

    // Neglect first, then the user's own ordering. When recent activity is
    // unknown every count is 0, so this degrades exactly to sortOrder.
    const attributes =
      context.attributes.status === "known"
        ? [...context.attributes.value].sort(
            (a, b) =>
              (touched.get(a.id) ?? 0) - (touched.get(b.id) ?? 0) ||
              a.sortOrder - b.sortOrder ||
              a.id.localeCompare(b.id),
          )
        : [];

    const capacity =
      context.todayCheckIn.status === "known"
        ? context.todayCheckIn.value.capacity
        : null;
    const overIndexed =
      completed.filter((entry) => entry.kind !== "rest").length >=
        OVER_INDEX_THRESHOLD &&
      !completed.some((entry) => entry.kind === "rest");
    const guardrails =
      context.activeGuardrails.status === "known"
        ? context.activeGuardrails.value
        : [];

    const becoming =
      context.becomingStatement.status === "known"
        ? context.becomingStatement.value.trim()
        : "";
    // Ground each rationale in the identity the user said they are building
    // toward. Never synthesized: absent input stays absent, and the unknown
    // list below still reports it.
    const identityClause = becoming
      ? ` It advances who you are becoming: "${becoming}".`
      : "";

    const missing = unknowns(context);
    const rationaleSuffix = missing.length
      ? ` Unknown context: ${missing.join(", ")}.`
      : "";

    const proposals: MissionProposal[] = [];
    const addProtectiveProposal = (
      kind: MissionProposal["kind"],
      rationale: string,
      guardrail?: KnownGuardrail,
    ) => {
      if (proposals.length >= 3) return;
      // A custom guardrail has owner-authored meaning that cannot safely be
      // inferred from its category. Use that statement as the action boundary
      // instead of synthesizing a generic exploration that may contradict it.
      const copy = protectiveCopy(
        kind,
        guardrail?.category === "custom" ? guardrail.statement : undefined,
      );
      proposals.push({
        rank: proposals.length + 1,
        title: copy.title,
        doneCondition: copy.doneCondition,
        size: "small",
        kind,
        attributeIds: attributes[0] ? [attributes[0].id] : [],
        questId: null,
        chapterId:
          context.activeChapter.status === "known"
            ? context.activeChapter.value.id
            : null,
        rationale:
          rationale +
          (guardrail ? ` Guardrail: "${guardrail.statement}".` : "") +
          identityClause +
          rationaleSuffix,
        citations: guardrail ? [guardrail.id] : [],
      });
    };

    if (capacity === "low")
      addProtectiveProposal(
        "rest",
        "Today's low capacity makes recovery the first priority.",
      );
    else if (overIndexed)
      addProtectiveProposal(
        "rest",
        `Recent activity shows ${completed.filter((e) => e.kind !== "rest").length} completed missions and no recovery.`,
      );

    for (const guardrail of guardrails) {
      const kind = protectiveKind(guardrail.category);
      if (completed.some((entry) => entry.kind === kind)) continue;
      addProtectiveProposal(
        kind,
        `The active ${guardrail.category} guardrail is not represented in recent completed activity.`,
        guardrail,
      );
    }

    for (const attribute of attributes.slice(
      0,
      Math.max(0, 3 - proposals.length),
    )) {
      const recent = touched.get(attribute.id) ?? 0;
      const activityClause = !activityKnown
        ? ""
        : recent === 0
          ? " No recently completed mission touched it."
          : ` ${recent} recently completed mission${recent === 1 ? "" : "s"} touched it.`;
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
        rationale:
          `Selected from the user-defined ${attribute.name} attribute.` +
          activityClause +
          identityClause +
          rationaleSuffix,
        citations: [
          attribute.id,
          ...(context.activeChapter.status === "known"
            ? [context.activeChapter.value.id]
            : []),
        ],
      });
    }

    if (!proposals.length)
      addProtectiveProposal(
        "exploration",
        "No linked attributes were available, so the plan leaves room to discover what matters today.",
      );

    return {
      generatorVersion: "deterministic-game-v3",
      planFingerprint: createHash("sha256")
        .update(JSON.stringify(context))
        .digest("hex"),
      proposals,
    };
  }
}
