import { llmApiKey, llmText } from "@/lib/llm/client";
import { findViolations, type GroundingViolation } from "@/lib/llm/grounded-explanations";
import type { JourneyStage } from "@/lib/services/journey";

/**
 * The closed fact set a coaching note may draw on. Everything here is computed
 * server-side from Mongo and Neo4j; nothing arrives from the request body, so a
 * caller cannot feed the model numbers of their own.
 */
export type CoachFacts = {
  stage: Pick<JourneyStage, "id" | "step" | "total" | "title" | "why">;
  roleTitle: string | null;
  readinessPercent: number | null;
  openGaps: number | null;
  nextSkillName: string | null;
  nextResource: { title: string; provider: string; durationMinutes: number } | null;
  /** Present only immediately after a graded completion, for progress narration. */
  justCompleted?: {
    skillNames: string[];
    scorePercent: number;
    unlockedSkillNames: string[];
  };
};

/**
 * Every number the note may contain. Same discipline as the resource
 * explanations: narrow enough that an invented figure cannot coincide with a
 * permitted one.
 */
export function coachAllowedNumbers(facts: CoachFacts): Set<string> {
  const values: number[] = [facts.stage.step, facts.stage.total];

  if (facts.readinessPercent !== null) values.push(facts.readinessPercent);
  if (facts.openGaps !== null) values.push(facts.openGaps);

  if (facts.nextResource) {
    const hours = facts.nextResource.durationMinutes / 60;
    values.push(facts.nextResource.durationMinutes, Math.round(hours));
    if (!Number.isInteger(hours)) values.push(Number(hours.toFixed(1)));
  }

  if (facts.justCompleted) {
    values.push(facts.justCompleted.scorePercent, facts.justCompleted.skillNames.length);
    values.push(facts.justCompleted.unlockedSkillNames.length);
  }

  return new Set(values.map(String));
}

/** Always a correct answer, with or without a model. */
export function deterministicCoachNote(facts: CoachFacts): string {
  if (facts.justCompleted) {
    const { skillNames, scorePercent, unlockedSkillNames } = facts.justCompleted;
    const moved = skillNames.length > 0 ? skillNames.join(" and ") : "that skill";
    const unlocked =
      unlockedSkillNames.length > 0
        ? ` That unlocks ${unlockedSkillNames.join(", ")}.`
        : "";
    return `You scored ${scorePercent}% and ${moved} moved.${unlocked}`;
  }

  const next =
    facts.nextResource && facts.nextSkillName
      ? ` Start with ${facts.nextResource.title} from ${facts.nextResource.provider}, about ${facts.nextResource.durationMinutes} minutes, which builds ${facts.nextSkillName}.`
      : "";

  return `${facts.stage.why}${next}`;
}

const SYSTEM = `
You are a learning coach speaking directly to one learner. Write at most 40 words,
plain prose, no markdown, no lists, no greeting.

Use ONLY the facts in the JSON. Say what to do next and why it is next.

Never state a URL, web address, price, rating, certificate, accreditation or job
guarantee. Never promise an outcome, a job, or a timeframe that is not in the facts.
The only numbers you may write are ones that appear in the facts.
Never tell the learner they are unsuited to something; describe the next step instead.
`;

/**
 * Model output is checked against the facts and thrown away if it asserts
 * anything they do not support, exactly as the resource explanations are. The
 * deterministic note is always a correct answer, so a missing key, a refusal or
 * an outage degrades silently instead of breaking the page.
 */
export async function generateCoachNote(
  facts: CoachFacts
): Promise<{ text: string; source: "llm" | "fallback"; violations: GroundingViolation[] }> {
  const fallback = deterministicCoachNote(facts);

  if (!llmApiKey()) {
    return { text: fallback, source: "fallback", violations: [] };
  }

  try {
    const text = await llmText({
      system: SYSTEM,
      user: JSON.stringify(facts, null, 2),
      temperature: 0.3,
      maxOutputTokens: 20000
    });

    const cleaned = text.trim().replace(/\s+/g, " ");
    const violations = findViolations(cleaned, coachAllowedNumbers(facts));

    return violations.length > 0
      ? { text: fallback, source: "fallback", violations }
      : { text: cleaned, source: "llm", violations: [] };
  } catch (error) {
    console.warn('[coach] model call failed:', error instanceof Error ? error.message : error);
    return { text: fallback, source: "fallback", violations: [] };
  }
}
