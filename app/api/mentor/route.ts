import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { loadLearnerState } from "@/lib/services/learner-state";
import { answerMentorQuestion, MAX_QUESTION_CHARS, type MentorFacts } from "@/lib/llm/mentor";
import { candidatesForGap } from "@/lib/services/recommendations";
import { DEFAULT_PREFERENCES, DEFAULT_WEEKLY_HOURS } from "@/lib/constants";
import { predictTimeline } from "@/lib/prediction/timeline";
import { getSkillGraph } from "@/lib/graph/queries";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  question: z.string().min(3).max(MAX_QUESTION_CHARS),
  /** Recent turns so a follow-up reads as one. Capped: this is prompt budget. */
  history: z
    .array(
      z.object({
        question: z.string().max(MAX_QUESTION_CHARS),
        answer: z.string().max(2000)
      })
    )
    .max(6)
    .default([])
});

/**
 * Still capped, for the same reason as before: `mentorAllowedNumbers` walks the
 * pack, so each number in it is one the grounding guard will permit in a reply.
 * The caps are wider than they were because the mentor was refusing fair
 * questions it simply had no facts for, which reads as the model being useless
 * rather than careful.
 */
const MAX_GAPS = 8;
/** Options across the next few gaps, not just the immediate one. */
const MAX_RESOURCE_GAPS = 3;
const MAX_RESOURCES_PER_GAP = 3;
const MAX_EVIDENCE = 8;

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

  const preferences = state.profile?.preferences ?? DEFAULT_PREFERENCES;
  const weeklyHours = state.profile?.weeklyHours ?? DEFAULT_WEEKLY_HOURS;

  // Candidates for the next few gaps, so "what else could I do instead" and
  // "what comes after that" are answerable rather than politely refused.
  const resourceGaps = state.gaps.slice(0, MAX_RESOURCE_GAPS);
  const nextResources = (
    await Promise.all(
      resourceGaps.map(async (gap) =>
        (await candidatesForGap(gap, state.mastery, preferences, weeklyHours))
          .slice(0, MAX_RESOURCES_PER_GAP)
          .map((candidate) => ({
            forSkill: gap.skill.name,
            title: candidate.resource.title,
            provider: candidate.resource.provider,
            durationMinutes: candidate.resource.durationMinutes,
            costType: candidate.resource.costType,
            resourceType: candidate.resource.resourceType
          }))
      )
    )
  ).flat();

  const timeline = predictTimeline({
    profile: state.profile,
    mastery: state.mastery,
    role: state.role,
    graph: await getSkillGraph(state.role.domainId),
    events: state.events
  });

  const facts: MentorFacts = {
    roleTitle: state.role.title,
    objective: state.profile?.careerObjective ?? "",
    experienceLevel: state.profile?.experienceLevel ?? "beginner",
    interests: state.profile?.interests ?? [],
    knownSkills: state.profile?.currentSkills ?? [],
    completedCourses: state.profile?.learningHistory ?? [],
    readinessPercent: Math.round(state.readiness * 100),
    // Names come from the graph; the model never gets to invent a skill.
    masteredSkills: masteredNames,
    gaps: state.gaps.slice(0, MAX_GAPS).map((gap) => ({
      skill: gap.skill.name,
      masteryPercent: Math.round(gap.currentMastery * 100),
      // The planner's own transitive chain. Recomputing it here from direct
      // prerequisites only meant the mentor could name fewer blockers than the
      // roadmap screen showed for the same skill.
      blockedBy: gap.blockedBy.map((blocker) => blocker.name)
    })),
    nextResources,
    evidenceCount: state.evidence.length,

    weeklyHours,
    timelineWeeks: state.profile?.timelineWeeks ?? 0,
    weeksToReady: timeline.expected,
    evidence: state.evidence.slice(0, MAX_EVIDENCE).map((item) => ({
      skill: state.gaps.find((gap) => gap.skill.id === item.skillId)?.skill.name ?? item.skillId,
      summary: item.summary,
      scorePercent: Math.round(item.rubricScore * 100)
    })),
    roadmapOrder: state.gaps.map((gap) => gap.skill.name),
    unlocks: state.gaps
      .filter((gap) => gap.unlocks.length > 0)
      .slice(0, MAX_GAPS)
      .map((gap) => ({ skill: gap.skill.name, opens: gap.unlocks })),
    diagnosticsTaken: state.events.filter((event) => event.verb === "diagnostic_answered").length
  };

  const answer = await answerMentorQuestion(parsed.data.question, facts, parsed.data.history);

  if (answer.violations.length > 0) {
    // Worth a log line: a reply rejected for grounding is either a model that
    // wandered or a fact pack too narrow for a fair question.
    console.warn('[mentor] answer rejected:', JSON.stringify(answer.violations));
  }

  return NextResponse.json({ text: answer.text, source: answer.source });
}
