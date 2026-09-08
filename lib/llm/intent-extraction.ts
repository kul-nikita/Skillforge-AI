import { z } from "zod";
import type { Role } from "@/lib/types";
import { llmJson } from "@/lib/llm/client";

const preferencesShape = z.object({
  maxHoursPerStep: z.number().min(0.5).max(20),
  cost: z.enum(["free", "paid", "freemium", "any"]),
  format: z.enum(["course", "lab", "doc", "project", "video", "any"])
});

const learnerProfileShape = z.object({
  careerObjective: z.string().min(1),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]),
  currentSkills: z.array(z.string()),
  interests: z.array(z.string()),
  learningHistory: z.array(z.string()),
  preferredTechnologies: z.array(z.string()),
  learningStyle: z.enum(["hands-on", "visual", "reading", "mixed", "unknown"])
});

/**
 * The role list is supplied by the caller from Neo4j, so the model can only
 * select a role that actually exists in the graph.
 */
export function buildIntentSchema(roles: Role[]) {
  const ids = roles.map((role) => role.id);

  return z.object({
    targetRoleId: z.string().refine((id) => ids.includes(id), {
      message: "targetRoleId must be one of the seeded roles"
    }),
    ...learnerProfileShape.shape,
    timelineWeeks: z.number().int().min(1).max(52),
    weeklyHours: z.number().min(1).max(60),
    preferences: preferencesShape,
    /**
     * Fields the model had to invent because the learner never said them.
     * Without this the guesses are indistinguishable from what was actually
     * stated, and the review screen presents both as "what we understood".
     */
    assumed: z.array(z.string()).default([]),
    /** Asked only when a guess was made about something that matters. */
    followUpQuestion: z.string().nullable().default(null)
  });
}

/**
 * A guess about the learner's format preference is harmless — the diagnostic and
 * the scorer correct for it. A guess about the role, the deadline or the hours
 * available shapes the entire roadmap, so it is worth one question.
 */
export const CRITICAL_FIELDS = ["targetRoleId", "timelineWeeks", "weeklyHours"] as const;

/** At most two follow-ups: past that it is an interrogation, not an onboarding. */
export const MAX_FOLLOW_UPS = 2;

export function criticalGuesses(assumed: string[]): string[] {
  return (CRITICAL_FIELDS as readonly string[]).filter((field) => assumed.includes(field));
}

export function needsFollowUp(assumed: string[], askedSoFar: number): boolean {
  return askedSoFar < MAX_FOLLOW_UPS && criticalGuesses(assumed).length > 0;
}

/**
 * Observed in a live run: the model guessed both the timeline and the weekly
 * budget and still returned `followUpQuestion: null`, so the conversation ended
 * one turn early. Whether a question gets asked is our decision; only its
 * wording is the model's, and there is a sensible default for each field.
 */
const DEFAULT_QUESTIONS: Record<string, string> = {
  targetRoleId: "Which kind of work appeals most — defending systems, building them, or working with data?",
  timelineWeeks: "Roughly how long do you want to give this?",
  weeklyHours: "About how many hours a week can you realistically spend?"
};

export function followUpFor(assumed: string[], question: string | null): string | null {
  const missing = criticalGuesses(assumed);

  if (missing.length === 0) {
    return null;
  }

  return question?.trim() ? question : (DEFAULT_QUESTIONS[missing[0]] ?? null);
}

export type LearnerIntent = z.infer<ReturnType<typeof buildIntentSchema>>;

/** The provider's structured-output schema — the first of the two gates. */
function responseSchema(roleIds: string[]) {
  const stringArray = { type: "ARRAY", items: { type: "STRING" } };

  return {
    type: "OBJECT",
    properties: {
      targetRoleId: { type: "STRING", enum: roleIds },
      careerObjective: { type: "STRING" },
      experienceLevel: { type: "STRING", enum: ["beginner", "intermediate", "advanced"] },
      currentSkills: stringArray,
      interests: stringArray,
      learningHistory: stringArray,
      preferredTechnologies: stringArray,
      learningStyle: {
        type: "STRING",
        enum: ["hands-on", "visual", "reading", "mixed", "unknown"]
      },
      timelineWeeks: { type: "INTEGER" },
      weeklyHours: { type: "NUMBER" },
      assumed: { type: "ARRAY", items: { type: "STRING" } },
      followUpQuestion: { type: "STRING", nullable: true },
      preferences: {
        type: "OBJECT",
        properties: {
          maxHoursPerStep: { type: "NUMBER" },
          cost: { type: "STRING", enum: ["free", "paid", "freemium", "any"] },
          format: {
            type: "STRING",
            enum: ["course", "lab", "doc", "project", "video", "any"]
          }
        },
        required: ["maxHoursPerStep", "cost", "format"]
      }
    },
    required: [
      "targetRoleId",
      "careerObjective",
      "experienceLevel",
      "currentSkills",
      "interests",
      "learningHistory",
      "preferredTechnologies",
      "learningStyle",
      "timelineWeeks",
      "weeklyHours",
      "preferences",
      "assumed"
    ]
  };
}

/**
 * A learner's natural-language goal, as a structured profile.
 *
 * Takes the whole conversation so far rather than one message, so a follow-up
 * answer is read in the context of what was already said instead of replacing
 * it.
 */
export async function extractLearnerIntent(
  transcript: string,
  roles: Role[]
): Promise<LearnerIntent> {
  if (roles.length === 0) {
    throw new Error("No roles are seeded, so intent cannot be mapped to a target role.");
  }

  const roleSummary = roles
    .map((role) => `${role.id} — ${role.title} (${role.domainId}): ${role.description}`)
    .join("\n");

  const systemInstruction = `
You are the learner profiling engine for a personalized learning platform.
Analyze a learner's natural-language message and convert it into a structured
learner profile.

AVAILABLE CAREER ROLES:
${roleSummary}

RULES:
1. Choose targetRoleId ONLY from the roles above, and never invent one. Pick the
   closest match even if the learner uses different wording.
2. Extract the learner's career objective from their message.
3. Put skills the learner says they already know in currentSkills, but do NOT
   treat a mentioned skill as proven mastery — the diagnostic decides that, so
   never assign mastery scores here.
4. Put previous courses, certifications, projects, bootcamps and tutorials in
   learningHistory. Never invent one the learner did not claim.
5. Put genuine areas of interest in interests, and technologies, languages,
   tools, frameworks or platforms in preferredTechnologies.
6. Estimate experienceLevel from what they describe; use beginner when unclear.
7. Determine learningStyle from their wording:
   - hands-on: labs, coding, projects, practice
   - visual: diagrams, videos, visual explanations
   - reading: books, documentation, articles
   - mixed: multiple learning styles
   - unknown: insufficient information
8. Return an empty array for anything that cannot reasonably be inferred.
9. If timeline is missing, estimate a realistic 1-52 weeks. If weekly study time
   or session length is missing, estimate a reasonable commitment.
10. Keep arrays concise and useful for later skill-gap analysis.
11. List in "assumed" every field you filled from inference rather than from
    something the learner actually said. Be honest: a plausible default is still
    an assumption.
12. If you assumed targetRoleId, timelineWeeks or weeklyHours, set
    followUpQuestion to ONE short, friendly question that would let you stop
    assuming it. Ask about one thing only, in plain language, and never list the
    role ids at the learner. Otherwise set it to null.

Return ONLY the structured JSON response matching the provided schema.
`;

  // The model proposes; the graph disposes. `buildIntentSchema` re-checks the
  // role id against the seeded list even though the enum already constrained it.
  return llmJson(
    {
      system: systemInstruction,
      user: transcript,
      responseSchema: responseSchema(roles.map((role) => role.id))
    },
    buildIntentSchema(roles)
  );
}
