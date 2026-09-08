import type { LearningResource, ScoreBreakdown } from "@/lib/types";
import { llmApiKey, llmText } from "@/lib/llm/client";

export type GroundedFacts = {
  resource: Pick<
    LearningResource,
    "title" | "provider" | "durationMinutes" | "costType" | "evidenceType" | "difficulty"
  >;
  skillName: string;
  currentMasteryPercent: number;
  score: ScoreBreakdown;
};


/**
 * Product rule 1: the model explains, it never supplies ground truth. It is
 * given a closed set of facts and its output is then *checked* against them —
 * a prompt instruction alone is not a guarantee.
 */
function buildGroundedPrompt(facts: GroundedFacts) {
  return {
    system:
      "You write one short paragraph (max 45 words) explaining why a learning resource was recommended. " +
      "Use ONLY the facts in the JSON. Never state a URL, web address, price, rating, certificate, " +
      "accreditation, or job guarantee. The only numbers you may write are the duration and the " +
      "current mastery percentage; never cite the score components. " +
      "Do not promise outcomes. Plain prose, no markdown, no lists.",
    user: JSON.stringify(facts, null, 2)
  };
}

/**
 * Every number the model may write. Deliberately narrow: score components are
 * NOT included, because the UI already renders them as a table and allowing
 * six extra percentages widens the set enough that an invented duration can
 * collide with one (e.g. a 90-minute claim slipping through because the total
 * score happened to be 90%).
 */
export function allowedNumbers(facts: GroundedFacts): Set<string> {
  const hours = facts.resource.durationMinutes / 60;
  const values = [
    facts.resource.durationMinutes,
    facts.currentMasteryPercent,
    Math.round(hours),
    Number.isInteger(hours) ? hours : Number(hours.toFixed(1))
  ];

  return new Set(values.map((value) => String(value)));
}

const URLISH = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|dev|edu|co)\b)/i;
// Two patterns: `\b` works for words but never matches before a symbol like
// `$` (space→$ is non-word to non-word), so currency needs its own alternative.
const BANNED_CLAIMS = /\b(?:certificat\w*|accredit\w*|guarantee\w*|usd|eur|gbp)\b|[$£€]/i;

export type GroundingViolation = { kind: "url" | "claim" | "number"; detail: string };

/**
 * The guard itself, over any closed fact set: no URLs, no price or credential
 * claims, and no number the caller did not supply. Shared by every feature that
 * lets a model write prose about a learner's real data, so there is one
 * definition of "grounded" rather than one per feature.
 */
export function findViolations(
  text: string,
  permitted: Set<string>,
  /** Words from BANNED_CLAIMS that these facts genuinely support, e.g. a certificate artifact. */
  allowedClaims: string[] = []
): GroundingViolation[] {
  const violations: GroundingViolation[] = [];

  const url = text.match(URLISH);
  if (url) {
    violations.push({ kind: "url", detail: url[0] });
  }

  const claim = text.match(BANNED_CLAIMS);
  if (claim && !allowedClaims.some((allowed) => allowed.toLowerCase().includes(claim[0].toLowerCase()))) {
    violations.push({ kind: "claim", detail: claim[0] });
  }

  for (const match of text.matchAll(/\d+(?:\.\d+)?/g)) {
    if (!permitted.has(match[0])) {
      violations.push({ kind: "number", detail: match[0] });
    }
  }

  return violations;
}

/**
 * Rejects output that asserts anything the facts don't support. This is the
 * check that makes "the LLM never invents facts" enforceable rather than
 * aspirational.
 */
export function findGroundingViolations(text: string, facts: GroundedFacts): GroundingViolation[] {
  // "certificate" is only allowed if the artifact really is one.
  return findViolations(text, allowedNumbers(facts), [facts.resource.evidenceType ?? ""]);
}

export async function generateGroundedExplanation(
  facts: GroundedFacts,
  fallback: string
): Promise<{ text: string; source: "llm" | "fallback"; violations: GroundingViolation[] }> {
  if (!llmApiKey()) {
    return { text: fallback, source: "fallback", violations: [] };
  }

  const prompt = buildGroundedPrompt(facts);

  try {
    const text = await llmText({
      system: prompt.system,
      user: prompt.user,
      temperature: 0.2,
      maxOutputTokens: 40000
    });

    const cleaned = text.trim().replace(/\s+/g, " ");
    const violations = findGroundingViolations(cleaned, facts);

    // Ungrounded output is discarded, never shown — the deterministic
    // sentence is always a correct answer.
    if (violations.length > 0) {
      return { text: fallback, source: "fallback", violations };
    }

    return { text: cleaned, source: "llm", violations: [] };
  } catch {
    return { text: fallback, source: "fallback", violations: [] };
  }
}
