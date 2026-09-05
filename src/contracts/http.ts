import { z } from "zod";

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const localDate = z.iso.date();
const questSize = z.enum(["small", "standard", "major"]);
const questRole = z.enum(["main", "side"]);
const capacity = z.enum(["low", "normal", "high"]);
const outcome = z.enum(["completed", "attempted", "dropped"]);

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
      startDate: localDate,
      endDate: localDate,
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

export const checkInSchema = z.object({
  capacity,
  reflection: z.string().trim().max(2000).optional(),
});

export const createQuestSchema = z
  .object({
    localDate: localDate.optional(),
    title: boundedText(200),
    doneCondition: boundedText(1000),
    reason: boundedText(1000),
    size: questSize.default("standard"),
    aspectIds: z.array(z.string().uuid()).default([]),
    milestoneId: z.string().uuid().nullable().optional(),
  })
  .superRefine((input, context) => {
    if (input.aspectIds.length === 0 && !input.milestoneId) {
      context.addIssue({
        code: "custom",
        message: "A quest must link to an aspect or milestone.",
        path: ["aspectIds"],
      });
    }
  });

export const updateQuestSchema = z
  .object({
    title: boundedText(200).optional(),
    doneCondition: boundedText(1000).optional(),
    reason: boundedText(1000).optional(),
    size: questSize.optional(),
    aspectIds: z.array(z.string().uuid()).optional(),
    milestoneId: z.string().uuid().nullable().optional(),
  })
  .superRefine((input, context) => {
    if (
      input.aspectIds !== undefined &&
      input.aspectIds.length === 0 &&
      input.milestoneId === null
    ) {
      context.addIssue({
        code: "custom",
        message: "A quest must link to an aspect or milestone.",
        path: ["aspectIds"],
      });
    }
  });

export const acceptQuestSchema = z.object({
  role: questRole,
});

export const swapQuestSchema = z.object({
  replacementQuestId: z.string().uuid(),
  role: questRole,
});

export const resolveQuestSchema = z.object({
  outcome,
  reflection: z.string().trim().max(2000).optional(),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type CheckInInput = z.infer<typeof checkInSchema>;
export type CreateQuestInput = z.infer<typeof createQuestSchema>;
export type UpdateQuestInput = z.infer<typeof updateQuestSchema>;
export type AcceptQuestInput = z.infer<typeof acceptQuestSchema>;
export type SwapQuestInput = z.infer<typeof swapQuestSchema>;
export type ResolveQuestInput = z.infer<typeof resolveQuestSchema>;
