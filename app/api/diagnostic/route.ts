import { NextResponse } from "next/server";
import { z } from "zod";
import { getRole } from "@/lib/graph/queries";
import { deriveMasteryFromEvents } from "@/lib/adaptation/mastery";
import {
  MAX_QUESTIONS,
  diagnosticEvents,
  estimateMastery,
  gradeAnswers,
  selectNextQuestion
} from "@/lib/diagnostic/engine";
import { appendEvents } from "@/lib/db/learners";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  // learnerId is deliberately NOT accepted from the client — it comes from the
  // session, otherwise anyone could append events to another learner's log.
  targetRoleId: z.string().min(1),
  // -1 means "skipped", which grades as incorrect.
  answers: z
    .array(z.object({ questionId: z.string(), selectedIndex: z.number().int().min(-1) }))
    .default([]),
  /** Only persist when the learner has consented. */
  persist: z.boolean().default(false)
});

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { targetRoleId, answers: submitted, persist } = parsed.data;
  const role = await getRole(targetRoleId);

  if (!role) {
    return NextResponse.json({ error: `Unknown role: ${targetRoleId}` }, { status: 404 });
  }

  const answers = gradeAnswers(submitted);
  const question = selectNextQuestion(role, answers);

  if (question) {
    // Never ship correctIndex to the client — it would leak the answer.
    const { correctIndex: _correctIndex, ...safeQuestion } = question;
    return NextResponse.json({
      done: false,
      progress: { answered: answers.length, max: MAX_QUESTIONS },
      question: safeQuestion
    });
  }

  const estimates = estimateMastery(answers);
  const events = diagnosticEvents(user.id, estimates, new Date().toISOString());

  // Product rule 5: only store results for a signed-in learner who consented.
  const canPersist = persist && Boolean(user.consentGiven);

  if (canPersist) {
    await appendEvents(events);
  }

  return NextResponse.json({
    done: true,
    persisted: canPersist,
    progress: { answered: answers.length, max: MAX_QUESTIONS },
    mastery: deriveMasteryFromEvents(events),
    events
  });
}
