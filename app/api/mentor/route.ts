import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { loadLearnerState } from "@/lib/services/learner-state";
import { answerMentorQuestion, MAX_QUESTION_CHARS, type MentorFacts } from "@/lib/llm/mentor";
import { candidatesForGap } from "@/lib/services/recommendations";
import { DEFAULT_PREFERENCES, DEFAULT_WEEKLY_HOURS } from "@/lib/constants";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  question: z.string().min(3).max(MAX_QUESTION_CHARS)
});

/** Kept small on purpose: every number in the pack is a number the guard must permit. */
const MAX_GAPS = 5;
const MAX_RESOURCES = 3;
const PREREQUISITE_THRESHOLD = 0.6;

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ask a question of a few words." }, { status: 400 });
  }

  const state = await loadLearnerState(user.id);

  if (!state.role) {
    return NextResponse.json(
      { error: "Set your goal first — I answer from your own roadmap." },
      { status: 400 }
    );
  }

  const masteredNames = state.role.requiredSkills
    .filter((required) => (state.mastery[required.skillId] ?? 0) >= 0.8)
    .map((required) => state.gaps.find((gap) => gap.skill.id === required.skillId)?.skill.name)
    .filter((name): name is string => Boolean(name));

  const nextResources = state.nextGap
    ? (
        await candidatesForGap(
          state.nextGap,
          state.mastery,
          state.profile?.preferences ?? DEFAULT_PREFERENCES,
          state.profile?.weeklyHours ?? DEFAULT_WEEKLY_HOURS
        )
      )
        .slice(0, MAX_RESOURCES)
        .map((candidate) => ({
          title: candidate.resource.title,
          provider: candidate.resource.provider,
          durationMinutes: candidate.resource.durationMinutes
        }))
    : [];

  const facts: MentorFacts = {
    roleTitle: state.role.title,
    readinessPercent: Math.round(state.readiness * 100),
    // Names come from the graph; the model never gets to invent a skill.
    masteredSkills: masteredNames,
    gaps: state.gaps.slice(0, MAX_GAPS).map((gap) => ({
      skill: gap.skill.name,
      masteryPercent: Math.round(gap.currentMastery * 100),
      blockedBy: gap.skill.prerequisites
        .filter((id) => (state.mastery[id] ?? 0) < PREREQUISITE_THRESHOLD)
        .map((id) => state.gaps.find((other) => other.skill.id === id)?.skill.name ?? id)
    })),
    nextResources,
    evidenceCount: state.evidence.length
  };

  const answer = await answerMentorQuestion(parsed.data.question, facts);

  if (answer.violations.length > 0) {
    // Worth a log line: a reply rejected for grounding is either a model that
    // wandered or a fact pack too narrow for a fair question.
    console.warn('[mentor] answer rejected:', JSON.stringify(answer.violations));
  }

  return NextResponse.json({ text: answer.text, source: answer.source });
}
