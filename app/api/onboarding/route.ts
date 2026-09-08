import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { listRoles } from "@/lib/graph/queries";
import { extractLearnerIntent, followUpFor, needsFollowUp } from "@/lib/llm/intent-extraction";
import { GeminiError } from "@/lib/llm/gemini";
import { upsertProfile } from "@/lib/db/learners";
import { setConsent } from "@/lib/db/users";
import { preferencesSchema } from "@/lib/db/schemas";

export const dynamic = "force-dynamic";

const parseSchema = z.object({
  goal: z.string().min(3).max(2000),
  /** Answers to the follow-ups asked so far, oldest first. */
  replies: z
    .array(
      z.object({
        question: z.string().min(1).max(300),
        answer: z.string().min(1).max(500)
      })
    )
    .max(4)
    .default([])
});

/** The whole conversation, so a follow-up answer adds to the goal rather than replacing it. */
function buildTranscript(goal: string, replies: Array<{ question: string; answer: string }>) {
  return [
    `LEARNER'S GOAL: ${goal}`,
    ...replies.map(({ question, answer }) => `YOU ASKED: ${question}\nLEARNER ANSWERED: ${answer}`)
  ].join("\n\n");
}

/**
 * Step 1: free text -> structured intent, asking a follow-up when the model had
 * to guess something that shapes the whole roadmap. Nothing is written yet.
 */
export async function POST(request: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const parsed = parseSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Describe your goal in a sentence or two." }, { status: 400 });
  }

  const roles = await listRoles();
  const { goal, replies } = parsed.data;

  try {
    const intent = await extractLearnerIntent(buildTranscript(goal, replies), roles);

    const question = followUpFor(intent.assumed, intent.followUpQuestion);

    if (question && needsFollowUp(intent.assumed, replies.length)) {
      // Guessing the role, the deadline or the weekly budget shapes everything
      // downstream, so ask rather than present the guess as understanding.
      return NextResponse.json({ done: false, question });
    }

    const role = roles.find((candidate) => candidate.id === intent.targetRoleId)!;

    // Echo the matched role so the learner can correct it before anything is saved.
    return NextResponse.json({ done: true, intent, role, assumed: intent.assumed });
  } catch (error) {
    console.error("[onboarding] intent extraction failed:", error instanceof Error ? error.message : error);

    // Onboarding is step one: if it cannot complete, nothing else in the product
    // can be reached. The client falls back to choosing a role directly, so a
    // model outage costs the conversation, not the account.
    return NextResponse.json(
      {
        error: "The assistant is unavailable right now — you can set your goal manually instead.",
        modelUnavailable: error instanceof GeminiError
      },
      { status: 502 }
    );
  }
}

const confirmSchema = z.object({
  targetRoleId: z.string().min(1),

  careerObjective: z.string().min(1),

  experienceLevel: z.enum([
    "beginner",
    "intermediate",
    "advanced"
  ]),

  currentSkills: z.array(z.string()),
  interests: z.array(z.string()),
  learningHistory: z.array(z.string()),
  preferredTechnologies: z.array(z.string()),

  learningStyle: z.enum([
    "hands-on",
    "visual",
    "reading",
    "mixed",
    "unknown"
  ]),

  timelineWeeks: z.number().int().min(1).max(52),
  weeklyHours: z.number().min(1).max(60),

  preferences: preferencesSchema,

  consentGiven: z.boolean()
});

/** Step 2: the learner confirms (and may edit) — only now do we persist. */
export async function PUT(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const parsed = confirmSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { consentGiven, ...profile } = parsed.data;

  // Role id is re-checked against the graph: the client is not trusted either.
  const roles = await listRoles();
  if (!roles.some((role) => role.id === profile.targetRoleId)) {
    return NextResponse.json({ error: `Unknown role: ${profile.targetRoleId}` }, { status: 400 });
  }

  await setConsent(user.id, consentGiven);
  const saved = await upsertProfile({ ...profile, learnerId: user.id, consentGiven });

  return NextResponse.json({ profile: saved });
}
