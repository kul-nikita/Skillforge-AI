import { z } from "zod";
import { llmApiKey, llmJson } from "@/lib/llm/client";
import { findViolations } from "@/lib/llm/grounded-explanations";
import type { Difficulty, LearnerProfile, Skill } from "@/lib/types";

/**
 * Diagnostic questions written for this learner rather than pulled from a fixed
 * bank of 288.
 *
 * What the model does NOT decide: which skill to ask about, or at what level.
 * `remainingTargets()` in the planner settles that from the role's own skill
 * importances, so sequencing stays deterministic (product rule 2) and only the
 * wording is generated.
 *
 * The answer key never reaches the browser. The route signs what it issued and
 * grades against that, exactly as the verification interview does.
 */

const OPTION_COUNT = 4;

const questionShape = z.object({
  prompt: z.string().min(20).max(600),
  options: z.array(z.string().min(1).max(240)).length(OPTION_COUNT),
  correctIndex: z.number().int().min(0).max(OPTION_COUNT - 1),
  /**
   * Why this learner is being asked this, in one line. Shown above the question:
   * without it the personalisation is real but invisible, which is how the old
   * flow read as a static quiz.
   */
  rationale: z.string().min(10).max(200)
});

export type GeneratedQuestion = z.infer<typeof questionShape>;

const responseSchema = {
  type: "OBJECT",
  properties: {
    prompt: { type: "STRING" },
    options: { type: "ARRAY", items: { type: "STRING" } },
    correctIndex: { type: "NUMBER" },
    rationale: { type: "STRING" }
  }
};

const DIFFICULTY_BRIEF: Record<Difficulty, string> = {
  beginner:
    "Foundational recall or a single clear concept. Someone who has read an introduction should get this.",
  intermediate:
    "Applied understanding: a small realistic situation where the right idea has to be selected, not recalled.",
  advanced:
    "Judgement under a trade-off: two options look defensible and the distinction matters in practice."
};

function learnerBrief(profile: LearnerProfile | null): string {
  if (!profile) {
    return "Nothing is known about this learner yet. Pitch the question neutrally.";
  }

  const lines = [`Stated experience level: ${profile.experienceLevel}.`];

  if (profile.currentSkills.length > 0) {
    lines.push(`Says they already know: ${profile.currentSkills.join(", ")}.`);
  }
  if (profile.preferredTechnologies.length > 0) {
    lines.push(`Works with: ${profile.preferredTechnologies.join(", ")}.`);
  }
  if (profile.learningHistory.length > 0) {
    lines.push(`Has previously done: ${profile.learningHistory.join(", ")}.`);
  }

  return lines.join("\n");
}

/**
 * The rationale is prose about a real person, so it goes through the same guard
 * every other generated sentence in this product goes through: no URLs, no
 * prices or credentials, and no number the facts did not contain.
 */
function rationaleIsGrounded(rationale: string, profile: LearnerProfile | null): boolean {
  const permitted = new Set<string>();

  if (profile) {
    permitted.add(String(profile.timelineWeeks));
    permitted.add(String(profile.weeklyHours));
  }

  return findViolations(rationale, permitted).length === 0;
}

/**
 * One multiple-choice question, or null when the model is unavailable or
 * returns something unusable. Null means "fall back to the bank" — the
 * diagnostic must still run with no API key at all.
 */
export async function generateQuestion({
  askedPrompts,
  difficulty,
  profile,
  roleTitle,
  skill
}: {
  /** Prompts already used this run, so the model does not repeat itself. */
  askedPrompts: string[];
  difficulty: Difficulty;
  profile: LearnerProfile | null;
  roleTitle: string;
  skill: Skill;
}): Promise<GeneratedQuestion | null> {
  if (!llmApiKey()) {
    return null;
  }

  const system = `
You write one multiple-choice diagnostic question that measures whether a
learner already has a specific skill. You are not teaching and not advising.

TARGET ROLE: ${roleTitle}
SKILL BEING MEASURED: ${skill.name} — ${skill.description}
LEVEL: ${difficulty}. ${DIFFICULTY_BRIEF[difficulty]}

WHO YOU ARE ASKING:
${learnerBrief(profile)}

RULES:
1. Exactly ${OPTION_COUNT} options. Exactly one is correct, and correctIndex is
   its position, counting from 0.
2. The wrong options must be plausible to someone who half-knows the topic. No
   joke answers, no "all of the above", no option that is obviously longer or
   more detailed than the others.
3. Measure ${skill.name} specifically. A question that someone could answer from
   general knowledge measures nothing.
4. Use what you know about this learner to pitch it — their tools, their stated
   level — but never assert a fact about them that is not listed above.
5. Never invent a URL, a price, a certificate name, a product version number or
   a statistic. Describe situations, not sources.
6. rationale: one line, addressed to the learner as "you", saying why THIS
   PERSON is being asked THIS question. Refer to something listed under WHO YOU
   ARE ASKING when there is something relevant — their level, a tool they use,
   something they have already done — rather than describing what the question
   measures. "You said you already work with Burp Suite, so this one goes
   straight to interpreting its output" is right; "This question assesses your
   ability to interpret proxy output" is wrong, because it would read the same
   for everybody. It must not hint at which option is correct.
7. Do not repeat any of these already-asked questions:
${askedPrompts.map((prompt) => `- ${prompt}`).join("\n") || "- (none yet)"}

Return ONLY the structured JSON response matching the provided schema.
`;

  try {
    const question = await llmJson(
      {
        system,
        user: `Write the ${difficulty} question for ${skill.name}.`,
        responseSchema,
        temperature: 0.7,
        maxOutputTokens: 700
      },
      questionShape
    );

    // Distinct options, or the "one correct answer" premise is broken.
    if (new Set(question.options.map((option) => option.trim().toLowerCase())).size !== OPTION_COUNT) {
      return null;
    }

    if (!rationaleIsGrounded(question.rationale, profile)) {
      return null;
    }

    return question;
  } catch {
    // A diagnostic that cannot run is worse than one written in advance.
    return null;
  }
}
