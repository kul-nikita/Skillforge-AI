import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getMastery, getProfile } from "@/lib/db/learners";
import { findResourcesByIds } from "@/lib/db/resources";
import { getSkillGraph } from "@/lib/graph/queries";
import { buildRoadmap } from "@/lib/services/recommendations";
import { scoreResourcesForGap } from "@/lib/scoring/recommendations";
import { generateGroundedExplanation, type GroundedFacts } from "@/lib/llm/grounded-explanations";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  resourceId: z.string().min(1),
  skillId: z.string().min(1)
});

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "resourceId and skillId are required." }, { status: 400 });
  }

  const { resourceId, skillId } = parsed.data;
  const [resources, graph, mastery] = await Promise.all([
    findResourcesByIds([resourceId]),
    getSkillGraph(),
    getMastery(user.id)
  ]);

  const resource = resources[0];
  const skill = graph.skills.find((candidate) => candidate.id === skillId);

  if (!resource || !skill) {
    return NextResponse.json({ error: "Unknown resource or skill." }, { status: 404 });
  }

  if (!resource.skillTags.includes(skillId)) {
    return NextResponse.json({ error: "That resource does not teach that skill." }, { status: 400 });
  }

  const currentMastery = mastery[skillId] ?? 0;
  // Facts are recomputed from the stores — never taken from the request body,
  // so a caller cannot feed fabricated numbers into the prompt.
  const [scored] = scoreResourcesForGap({
    gap: { skill, importance: 1, currentMastery, reason: "", blockedBy: [], unlocks: [] },
    resources: [resource],
    mastery,
    preferences: { maxHoursPerStep: 4, cost: "any", format: "any" },
    weeklyHours: 40
  });

  if (!scored) {
    return NextResponse.json({ error: "That resource is not a valid candidate." }, { status: 400 });
  }

  // The same blockers the roadmap shows, from the same planner — an explanation
  // that disagreed with the list next to it would be worse than none.
  const profile = await getProfile(user.id);
  const gap = profile?.targetRoleId
    ? (await buildRoadmap(profile.targetRoleId, mastery)).gaps.find(
        (candidate) => candidate.skill.id === skillId
      )
    : undefined;

  const facts: GroundedFacts = {
    resource: {
      title: resource.title,
      provider: resource.provider,
      durationMinutes: resource.durationMinutes,
      costType: resource.costType,
      evidenceType: resource.evidenceType,
      difficulty: resource.difficulty
    },
    skillName: skill.name,
    currentMasteryPercent: Math.round(currentMastery * 100),
    score: scored.score,
    ...(gap && gap.blockedBy.length > 0
      ? {
          blockedBy: gap.blockedBy.map((blocker) => ({
            name: blocker.name,
            masteryPercent: Math.round(blocker.mastery * 100)
          }))
        }
      : {}),
    ...(gap && gap.unlocks.length > 0 ? { unlocks: gap.unlocks } : {})
  };

  const result = await generateGroundedExplanation(facts, scored.explanation.whatGapItCloses);

  return NextResponse.json({
    text: result.text,
    // Surfaced so the UI can be honest about whether a model wrote this.
    source: result.source,
    rejectedForGrounding: result.violations.length > 0
  });
}
