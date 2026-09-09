import { z } from "zod";
import { llmApiKey, llmJson } from "@/lib/llm/client";
import type { PageText } from "@/lib/services/page-text";
import type { Skill } from "@/lib/types";

/**
 * Reads catalog metadata off a page the server actually fetched.
 *
 * Product rule 1 says the model never originates a URL, price, duration or
 * provider. Extracting them from real fetched text is not originating them —
 * but only while the model is held to the text, so every field here is
 * NULLABLE and the prompt's central instruction is to return null rather than
 * fill a gap. A guessed `durationMinutes` would silently corrupt the TimeFit
 * term in the scoring formula, and nobody would ever see where it came from.
 *
 * The output is a suggestion for a form an admin then reviews. It is never
 * saved directly, and the existing validation (URL reachable, skill ids exist
 * in the graph, no self-prerequisite, no duplicate URL, host allowlist) still
 * runs on save.
 */

const RESOURCE_TYPES = ["course", "lab", "doc", "project", "video"] as const;
const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
const COST_TYPES = ["free", "freemium", "paid"] as const;

const extractionShape = z.object({
  title: z.string().min(1).max(160).nullable(),
  provider: z.string().min(1).max(80).nullable(),
  description: z.string().min(1).max(400).nullable(),
  resourceType: z.enum(RESOURCE_TYPES).nullable(),
  difficulty: z.enum(DIFFICULTIES).nullable(),
  /** Only when the page states a length. */
  durationMinutes: z.number().int().min(1).max(6000).nullable(),
  /** Only when the page states a price or says it is free. */
  costType: z.enum(COST_TYPES).nullable(),
  /** Graph skill ids this teaches, chosen from the supplied list. */
  skillTags: z.array(z.string()).max(4).default([]),
  /** Which fields the page did not state, so the UI can flag them honestly. */
  notStated: z.array(z.string()).default([])
});

export type ExtractedResource = z.infer<typeof extractionShape>;

function responseSchema(skillIds: string[]) {
  return {
    type: "OBJECT",
    properties: {
      title: { type: "STRING", nullable: true },
      provider: { type: "STRING", nullable: true },
      description: { type: "STRING", nullable: true },
      resourceType: { type: "STRING", enum: [...RESOURCE_TYPES], nullable: true },
      difficulty: { type: "STRING", enum: [...DIFFICULTIES], nullable: true },
      durationMinutes: { type: "NUMBER", nullable: true },
      costType: { type: "STRING", enum: [...COST_TYPES], nullable: true },
      skillTags: { type: "ARRAY", items: { type: "STRING", enum: skillIds } },
      notStated: { type: "ARRAY", items: { type: "STRING" } }
    }
  };
}

/**
 * Suggested fields for a catalog row, or null when the model is unavailable.
 * Never throws: a failed autofill leaves the admin typing, which is where they
 * were anyway.
 */
export async function extractResourceFields({
  page,
  skills,
  url
}: {
  page: PageText;
  /** The real graph skills, so a suggested tag can only be one that exists. */
  skills: Skill[];
  url: string;
}): Promise<ExtractedResource | null> {
  if (!llmApiKey() || !page.ok || page.text.length < 40) {
    return null;
  }

  const skillList = skills.map((skill) => `${skill.id} — ${skill.name}: ${skill.description}`).join("\n");

  const system = `
You read one web page and fill in a catalogue record for it. You are a
transcriber, not an author.

THE ONE RULE THAT MATTERS: every field is nullable, and null is the correct
answer whenever the page does not state it. Do not infer a duration from how
long the page looks. Do not assume something is free because no price appears.
Do not invent a provider from the domain name if the page names one. A wrong
value here silently corrupts how this resource is ranked for every learner;
a null just means a human types it.

FIELDS:
- title: the resource's own title, not the site name and not the browser tab
  boilerplate ("… | PortSwigger" -> "…").
- provider: the organisation publishing it, if the page identifies one.
- description: one factual sentence, max 40 words, describing what the learner
  does or learns here. Written from the page. No marketing language.
- resourceType: course | lab | doc | project | video — what this page IS.
  A written guide is doc. An interactive exercise or range is lab. A video or
  playlist is video. A structured multi-module offering is course. A build-it
  brief is project.
- difficulty: beginner | intermediate | advanced, ONLY if the page states a
  level or an explicit prerequisite implies one.
- durationMinutes: ONLY if the page states a length ("4 hours", "20 lessons of
  15 minutes" -> 300). Otherwise null.
- costType: free | freemium | paid, ONLY if the page states a price, a "free"
  claim, or a subscription requirement. Otherwise null.
- skillTags: up to 4 ids from the list below that this page actually teaches.
  Ids only, exactly as written. Empty if none genuinely fit — a wrong tag is
  worse than no tag, because it puts this resource in front of the wrong gap.
- notStated: name every field you returned null for, so a human knows what to
  fill rather than assuming it was blank by accident.

SKILL IDS AVAILABLE:
${skillList}

Return ONLY the structured JSON response matching the provided schema.
`;

  const user = [
    `URL: ${url}`,
    page.title ? `TITLE TAG: ${page.title}` : null,
    page.metaDescription ? `META DESCRIPTION: ${page.metaDescription}` : null,
    "",
    "PAGE TEXT (this is the only source you may use):",
    page.text
  ]
    .filter((line) => line !== null)
    .join("\n");

  try {
    const extracted = await llmJson(
      { system, user, responseSchema: responseSchema(skills.map((skill) => skill.id)), temperature: 0.1 },
      extractionShape
    );

    // The enum should prevent this, but a tag that is not a real skill id would
    // fail validation on save anyway — drop it here so the form stays clean.
    const known = new Set(skills.map((skill) => skill.id));

    return { ...extracted, skillTags: extracted.skillTags.filter((id) => known.has(id)) };
  } catch {
    return null;
  }
}
