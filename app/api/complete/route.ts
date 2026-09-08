import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { addEvidence, appendEvents, getMastery, listEvents } from "@/lib/db/learners";
import { findResourcesByIds } from "@/lib/db/resources";
import { getSkillsByIds } from "@/lib/graph/queries";
import {
  answeredQuestionIds,
  checkQuestionsForResource,
  completionEvents,
  completionEvidence,
  gradeCompletion
} from "@/lib/services/completion";
import { issueToken, tokenMatches } from "@/lib/crypto/signing";
import type { Evidence } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Step 1 — the post-check for a resource. Reads the event log because questions
 * used by an earlier completion are excluded.
 */
export async function GET(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const resourceId = new URL(request.url).searchParams.get("resourceId");
  if (!resourceId) {
    return NextResponse.json({ error: "resourceId is required." }, { status: 400 });
  }

  const [resource] = await findResourcesByIds([resourceId]);
  if (!resource) {
    return NextResponse.json({ error: `Unknown resource: ${resourceId}` }, { status: 404 });
  }

  const alreadyAsked = answeredQuestionIds(await listEvents(user.id));

  const questions = checkQuestionsForResource(resource, alreadyAsked).map(
    // Never ship correctIndex to the client — it would leak the answer.
    ({ correctIndex: _correctIndex, ...safe }) => safe
  );

  return NextResponse.json({
    resource: { id: resource.id, title: resource.title, evidenceType: resource.evidenceType },
    questions,
    // Signed record of which questions were issued, to whom, for what. Without
    // it the client chooses what it is graded on.
    token: issueToken(
      { k: "check", u: user.id, r: resource.id, q: questions.map((question) => question.id).sort() },
      CHECK_TOKEN_TTL_MS
    )
  });
}

/** Long enough to take the check, short enough to be worthless afterwards. */
const CHECK_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

const submitSchema = z.object({
  // learnerId comes from the session, never the body.
  resourceId: z.string().min(1),
  /** Issued by GET. Proves these are the questions the server asked for. */
  token: z.string().min(1),
  answers: z
    .array(z.object({ questionId: z.string(), selectedIndex: z.number().int().min(-1) }))
    .min(1),
  /** The learner's own words. Never generated, never graded by the model. */
  summary: z.string().min(10).max(1000),
  /** Stays null unless the learner actually has an artifact — never faked. */
  artifactUrl: z.string().url().max(2000).nullable().default(null)
});

/** Step 2 — grade it, append the events, and mint evidence if it was earned. */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const parsed = submitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { resourceId, token, answers, summary, artifactUrl } = parsed.data;
  const submittedIds = [...new Set(answers.map((answer) => answer.questionId))].sort();

  // The graded set must be the issued set: not a subset (drop the ones you got
  // wrong), not a superset, not another learner's or another resource's.
  if (!tokenMatches(token, { k: "check", u: user.id, r: resourceId, q: submittedIds })) {
    return NextResponse.json(
      { error: "That check has expired or does not match. Reload the post-check and try again." },
      { status: 400 }
    );
  }

  const [resource] = await findResourcesByIds([resourceId]);

  if (!resource) {
    return NextResponse.json({ error: `Unknown resource: ${resourceId}` }, { status: 404 });
  }

  // The token proves *which* questions were issued, not how many times they may
  // be graded — it carries no server state, so on its own it can be replayed to
  // mint evidence and inflate mastery from one sitting. The log is that state.
  const priorEvents = await listEvents(user.id);
  const alreadyGraded = new Set(answeredQuestionIds(priorEvents));

  if (submittedIds.some((id) => alreadyGraded.has(id))) {
    return NextResponse.json(
      { error: "You have already been graded on these questions. Reload the post-check for a fresh set." },
      { status: 409 }
    );
  }

  const { bySkill, overall } = gradeCompletion(resource, answers);
  const timestamp = new Date().toISOString();
  const events = completionEvents(user.id, resource, bySkill, timestamp);
  const skills = await getSkillsByIds(resource.skillTags);

  const evidence = completionEvidence({
    learnerId: user.id,
    resource,
    bySkill,
    overall,
    summary,
    artifactUrl,
    skills,
    timestamp
  });

  // Product rule 5: nothing is stored for a learner who has not consented.
  const persisted = Boolean(user.consentGiven);
  // The signed record as stored, so a caller can build a working /verify link.
  // Without consent nothing is minted, and the unsigned preview says so.
  let issued: Evidence | null = null;

  if (persisted) {
    await appendEvents(events);
    if (evidence) {
      issued = await addEvidence(evidence);
    }
  }

  return NextResponse.json({
    persisted,
    score: overall,
    bySkill,
    evidence: issued ?? evidence,
    // Recomputed from the log, so the client sees exactly what was stored.
    mastery: persisted ? await getMastery(user.id) : {}
  });
}
