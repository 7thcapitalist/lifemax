import { z } from "zod";
const text = (max: number) => z.string().trim().min(1).max(max);
const date = z.iso.date();
const size = z.enum(["small", "standard", "major"]);
const kind = z.enum(["progress", "rest", "relationship", "exploration"]);
const uuid = z.string().uuid();
export const dailyPlanSchema = z.object({
  localDate: date.optional(),
  capacityOverride: z.enum(["low", "normal", "high"]).optional(),
});
export const createMissionSchema = z
  .object({
    localDate: date.optional(),
    title: text(200),
    doneCondition: text(1000),
    kind,
    size: size.default("standard"),
    attributeIds: z.array(uuid).max(12).default([]),
    questId: uuid.nullable().optional(),
    chapterId: uuid.nullable().optional(),
    repeatFamilyKey: text(200).nullable().optional(),
  })
  .superRefine((v, c) => {
    if (!v.attributeIds.length && v.kind === "progress")
      c.addIssue({
        code: "custom",
        message: "Progress missions require an attribute.",
        path: ["attributeIds"],
      });
  });
export const updateMissionSchema = z.object({
  title: text(200).optional(),
  doneCondition: text(1000).optional(),
  kind: kind.optional(),
  size: size.optional(),
  attributeIds: z.array(uuid).max(12).optional(),
  questId: uuid.nullable().optional(),
  chapterId: uuid.nullable().optional(),
  status: z.enum(["accepted", "cancelled"]).optional(),
  acceptedStretch: z.boolean().optional(),
});
export const completeMissionSchema = z.object({
  idempotencyKey: text(200).optional(),
});
export const createChapterSchema = z.object({
  title: text(200),
  intent: text(2000),
  startDate: date,
  endDate: date.optional(),
  lengthDays: z.number().int().min(1).max(3650).optional(),
  status: z.enum(["draft", "active"]).default("draft"),
});
export const updateChapterSchema = z.object({
  title: text(200).optional(),
  intent: text(2000).optional(),
  startDate: date.optional(),
  endDate: date.optional(),
  status: z.enum(["active", "completed", "abandoned"]).optional(),
});
export const createRewardSchema = z.object({
  title: text(200),
  description: z.string().trim().max(1000).nullable().optional(),
  coinCost: z.number().int().positive().max(1_000_000),
});
export const updateRewardSchema = z.object({
  title: text(200).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  coinCost: z.number().int().positive().max(1_000_000).optional(),
  status: z.enum(["active", "archived"]).optional(),
});
export const redeemRewardSchema = z.object({ localDate: date.optional() });
export const createAcademicSchema = z.object({
  kind: text(100),
  title: text(200),
  course: z.string().trim().max(200).nullable().optional(),
  term: z.string().trim().max(100).nullable().optional(),
  dueDate: date.nullable().optional(),
  status: z
    .enum(["planned", "in_progress", "done", "dropped"])
    .nullable()
    .optional(),
  scoreValue: z.string().trim().max(100).nullable().optional(),
  scoreScale: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export const updateAcademicSchema = createAcademicSchema.partial();
export type DailyPlanInput = z.infer<typeof dailyPlanSchema>;
export type CreateMissionInput = z.infer<typeof createMissionSchema>;
export type UpdateMissionInput = z.infer<typeof updateMissionSchema>;
export type CreateChapterInput = z.infer<typeof createChapterSchema>;
export type UpdateChapterInput = z.infer<typeof updateChapterSchema>;
export type CreateRewardInput = z.infer<typeof createRewardSchema>;
export type UpdateRewardInput = z.infer<typeof updateRewardSchema>;
export type CreateAcademicInput = z.infer<typeof createAcademicSchema>;
export type UpdateAcademicInput = z.infer<typeof updateAcademicSchema>;
