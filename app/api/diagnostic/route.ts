import { NextResponse } from "next/server";
import { z } from "zod";
import { getRole, getSkillGraph } from "@/lib/graph/queries";
import { deriveMasteryFromEvents } from "@/lib/adaptation/mastery";
import {
  MAX_QUESTIONS,
  bankQuestion,
  diagnosticEvents,
  estimateMastery,
  gradeAnswers,
  remainingTargets
} from "@/lib/diagnostic/engine";
import { generateQuestion } from "@/lib/llm/diagnostic-questions";
import { issueToken } from "@/lib/crypto/signing";
import { appendEvents, getProfile, listEvents } from "@/lib/db/learners";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Long enough to think about a question, short enough that a token is not a key. */
const QUESTION_TTL_MS = 60 * 60 * 1000;

const requestSchema = z.object({
  // learnerId is deliberately NOT accepted from the client — it comes from the
  // session, otherwise anyone could append events to another learner's log.
  targetRoleId: z.string().min(1),
  // -1 means "skipped", which grades as incorrect.
  answers: z
    .array(
      z.object({
        questionId: z.string(),
        selectedIndex: z.number().int().min(-1),
        /** The server's signed record of the question it issued. */
        token: z.string().max(4000).optional()
      })
    )
    .default([]),
  /** Prompts already shown this run, so a generated question is not repeated. */
  askedPrompts: z.array(z.string().max(600)).max(MAX_QUESTIONS).default([]),
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

  const { targetRoleId, answers: submitted, askedPrompts, persist } = parsed.data;
  const role = await getRole(targetRoleId);

  if (!role) {
    return NextResponse.json({ error: `Unknown role: ${targetRoleId}` }, { status: 404 });
  }

  const answers = gradeAnswers(submitted, user.id);
  const targets = remainingTargets(role, answers);

  if (targets.length > 0) {
    const [graph, profile] = await Promise.all([getSkillGraph(role.domainId), getProfile(user.id)]);
    const skillById = new Map(graph.skills.map((skill) => [skill.id, skill]));

    // Walk the targets in priority order: a skill the model fluffed and the bank
    // cannot cover should cost that skill, not the rest of the diagnostic.
    for (const target of targets) {
      const skill = skillById.get(target.skillId);

      const generated = skill
        ? await generateQuestion({
            askedPrompts,
            difficulty: target.difficulty,
            profile,
            roleTitle: role.title,
            skill
          })
        : null;

      const fallback = generated ? null : bankQuestion(target);

      if (!generated && !fallback) {
        continue;
      }

      const questionId = generated
        ? `gen-${target.skillId}-${target.difficulty}-${answers.length}`
        : fallback!.id;

      const correctIndex = generated ? generated.correctIndex : fallback!.correctIndex;

      return NextResponse.json({
        done: false,
        progress: { answered: answers.length, max: MAX_QUESTIONS },
        question: {
          id: questionId,
          skillId: target.skillId,
          difficulty: target.difficulty,
          prompt: generated ? generated.prompt : fallback!.prompt,
          options: generated ? generated.options : fallback!.options,
          // Only a generated question carries a reason; the bank's rows are the
          // same for everyone and it would be a lie to dress them as personal.
          rationale: generated?.rationale ?? null,
          skillName: skill?.name ?? target.skillId,
          written: generated ? ("model" as const) : ("bank" as const)
        },
        // Never ship correctIndex to the client — it is sealed in here instead,
        // and comes back with the answer so a stateless route can still grade.
        token: issueToken(
          {
            learnerId: user.id,
            questionId,
            skillId: target.skillId,
            difficulty: target.difficulty,
            correctIndex
          },
          QUESTION_TTL_MS
        )
      });
    }
  }

  const estimates = estimateMastery(answers);
  const events = diagnosticEvents(user.id, estimates, new Date().toISOString());

  // Read the log before writing to it: what the learner knew coming in is what
  // makes a second run mean something.
  const previousMastery = deriveMasteryFromEvents(await listEvents(user.id));

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
    previousMastery,
    events
  });
}
