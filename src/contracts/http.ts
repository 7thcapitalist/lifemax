import { z } from "zod";

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
export const setupOwnerSchema = z.object({
  displayName: boundedText(100),
  timezone: z.string().refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Invalid IANA timezone"),
  password: z.string().min(12).max(256),
});
export const loginSchema = z.object({ password: z.string().min(1).max(256) });
export const onboardingSchema = z
  .object({
    becomingStatement: boundedText(2000),
    aspects: z
      .array(
        z.object({
          name: boundedText(100),
          definition: boundedText(1000),
          desiredIdentity: boundedText(1000),
          emphasis: z.enum(["active", "maintenance", "dormant"]),
        }),
      )
      .min(4)
      .max(6),
    northStars: z
      .array(
        z.object({ title: boundedText(200), motivation: boundedText(1000) }),
      )
      .max(3),
    chapter: z.object({
      title: boundedText(200),
      intent: boundedText(2000),
      startDate: z.iso.date(),
      endDate: z.iso.date(),
      milestones: z
        .array(
          z.object({
            title: boundedText(200),
            doneCondition: boundedText(1000),
            aspectIndexes: z.array(z.number().int().min(0).max(5)).min(1),
          }),
        )
        .min(1)
        .max(3),
    }),
    guardrails: z
      .array(
        z.object({
          category: z.enum([
            "sleep",
            "connection",
            "recovery",
            "novelty",
            "custom",
          ]),
          statement: boundedText(1000),
        }),
      )
      .min(1)
      .max(10),
  })
  .superRefine((input, context) => {
    input.chapter.milestones.forEach((milestone, milestoneIndex) => {
      const seen = new Set<number>();
      milestone.aspectIndexes.forEach((aspectIndex, aspectPosition) => {
        const path = [
          "chapter",
          "milestones",
          milestoneIndex,
          "aspectIndexes",
          aspectPosition,
        ];
        if (aspectIndex >= input.aspects.length)
          context.addIssue({
            code: "custom",
            message: "Aspect index is outside the submitted aspects.",
            path,
          });
        if (seen.has(aspectIndex))
          context.addIssue({
            code: "custom",
            message: "Aspect indexes must be unique.",
            path,
          });
        seen.add(aspectIndex);
      });
    });
  });
export type OnboardingInput = z.infer<typeof onboardingSchema>;
