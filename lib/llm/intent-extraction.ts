import { z } from "zod";
import type { Role } from "@/lib/types";
import { geminiJson } from "@/lib/llm/gemini";

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
    preferences: preferencesShape
  });
}

export type LearnerIntent = z.infer<ReturnType<typeof buildIntentSchema>>;

/** Gemini's own structured-output schema — the first of the two gates. */
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
      "preferences"
    ]
  };
}

/** A learner's natural-language goal, as a structured profile. */
export async function extractLearnerIntent(
  goalText: string,
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

Return ONLY the structured JSON response matching the provided schema.
`;

  // The model proposes; the graph disposes. `buildIntentSchema` re-checks the
  // role id against the seeded list even though the enum already constrained it.
  return geminiJson(
    {
      system: systemInstruction,
      user: goalText,
      responseSchema: responseSchema(roles.map((role) => role.id))
    },
    buildIntentSchema(roles)
  );
}
