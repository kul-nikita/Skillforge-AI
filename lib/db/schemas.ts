import { z } from "zod";

export const masteryScoreSchema = z.number().min(0).max(1);

export const preferencesSchema = z.object({
  maxHoursPerStep: z.number().positive(),
  cost: z.enum(["free", "paid", "freemium", "any"]),
  format: z.enum(["course", "lab", "doc", "project", "video", "any"])
});

export const evidenceSchema = z.object({
  id: z.string(),
  learnerId: z.string(),
  skillId: z.string(),
  resourceId: z.string(),
  summary: z.string().min(1),
  evidenceType: z.string().min(1),
  artifactUrl: z.string().url().nullable(),
  rubricScore: masteryScoreSchema,
  validatedCapabilities: z.array(z.string()).min(1),
  createdAt: z.string(),
  signature: z.string()
});

export const learningResourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  provider: z.string(),
  url: z.string().url(),
  resourceType: z.enum(["course", "lab", "doc", "project", "video"]),
  skillTags: z.array(z.string()).min(1),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  durationMinutes: z.number().int().positive(),
  costType: z.enum(["free", "paid", "freemium"]),
  language: z.string(),
  qualityScore: masteryScoreSchema,
  isCurated: z.boolean(),
  prerequisites: z.array(z.string()),
  evidenceType: z.string().nullable(),
  lastVerifiedAt: z.string(),
  description: z.string()
});
