import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { loadLearnerState } from "@/lib/services/learner-state";
import { generateCoachNote, type CoachFacts } from "@/lib/llm/coach";
import { findDownstreamSkills, getSkillsByIds } from "@/lib/graph/queries";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** Narrate the learner's most recent completion instead of the next step. */
  narrate: z.boolean().default(false)
});

const COMPLETION_VERBS = new Set(["quiz_completed", "lab_completed", "project_reviewed"]);

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse((await request.json().catch(() => null)) ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const state = await loadLearnerState(user.id);

  const facts: CoachFacts = {
    stage: {
      id: state.stage.id,
      step: state.stage.step,
      total: state.stage.total,
      title: state.stage.title,
      why: state.stage.why
    },
    roleTitle: state.role?.title ?? null,
    readinessPercent: state.role ? Math.round(state.readiness * 100) : null,
    openGaps: state.role ? state.gaps.length : null,
    nextSkillName: state.nextGap?.skill.name ?? null,
    nextResource: state.nextResource
      ? {
          title: state.nextResource.title,
          provider: state.nextResource.provider,
          durationMinutes: state.nextResource.durationMinutes
        }
      : null
  };

  if (parsed.data.narrate) {
    // Read from the log rather than the request: what moved is a fact about
    // what was graded, not something the client gets to assert.
    const completions = state.events.filter((event) => COMPLETION_VERBS.has(event.verb));
    const latest = completions.at(-1);

    if (latest) {
      const sameSubmission = completions.filter((event) => event.timestamp === latest.timestamp);
      const skillIds = [...new Set(sameSubmission.map((event) => event.skillId))];
      const [skills, ...downstream] = await Promise.all([
        getSkillsByIds(skillIds),
        ...skillIds.map((id) => findDownstreamSkills(id))
      ]);

      const roleSkillIds = new Set(state.role?.requiredSkills.map((r) => r.skillId) ?? []);
      const unlockedIds = [...new Set(downstream.flat())].filter(
        (id) => roleSkillIds.has(id) && !skillIds.includes(id)
      );

      const scores = sameSubmission.map((event) => event.score ?? 0);
      facts.justCompleted = {
        skillNames: skills.map((skill) => skill.name),
        scorePercent: Math.round((scores.reduce((a, b) => a + b, 0) / (scores.length || 1)) * 100),
        unlockedSkillNames: (await getSkillsByIds(unlockedIds)).map((skill) => skill.name)
      };
    }
  }

  const note = await generateCoachNote(facts);

  return NextResponse.json({
    stage: state.stage,
    text: note.text,
    // The UI states which one the reader is looking at, as /api/explain does.
    source: note.source
  });
}
