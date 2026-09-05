import type { BriefingDraft, BriefingInput } from "@/domain/briefing/generator";

export interface BriefingGenerator {
  readonly kind: "deterministic";
  generate(input: BriefingInput): BriefingDraft;
}
