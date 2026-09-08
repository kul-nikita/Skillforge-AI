import { NextResponse } from "next/server";
import { z } from "zod";
import { findDownstreamSkills, getRole, getSkillsByIds } from "@/lib/graph/queries";
import { requireUser } from "@/lib/auth/session";
import { getMastery, getProfile } from "@/lib/db/learners";
import { findResourcesBySkill } from "@/lib/db/resources";
import { applyAssessmentOutcome, planWeek } from "@/lib/adaptation/replan";
import { buildRoadmap, candidatesBySkill } from "@/lib/services/recommendations";
import { preferencesSchema } from "@/lib/db/schemas";

export const dynamic = "force-dynamic";

// Same shape as /api/roadmap: anything stated at onboarding is optional here
// and falls back to the stored profile, so omitting it returns the learner's
// own plan rather than a 400.
const requestSchema = z.object({
  targetRoleId: z.string().min(1).optional(),
  preferences: preferencesSchema.optional(),
  weeklyHours: z.number().min(1).max(60).optional(),
  mastery: z.record(z.number().min(0).max(1)).optional(),
  excludeResourceIds: z.array(z.string()).default([]),
  /** Optional quiz result that triggers remediation before the week is planned. */
  assessment: z
    .object({
      skillId: z.string(),
      score: z.number().min(0).max(1),
      finishedEarly: z.boolean().default(false)
    })
    .optional()
});

export async function POST(request: Request) {
  // Plans against a learner's mastery, so it cannot be an open endpoint.
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

  const { excludeResourceIds, assessment } = parsed.data;
  const profile = await getProfile(user.id);
  const targetRoleId = parsed.data.targetRoleId ?? profile?.targetRoleId;

  if (!targetRoleId) {
    return NextResponse.json(
      { error: "No target role set. Complete onboarding first." },
      { status: 400 }
    );
  }

  const mastery = parsed.data.mastery ?? (await getMastery(user.id));
  const preferences = parsed.data.preferences ??
    profile?.preferences ?? { maxHoursPerStep: 3, cost: "any" as const, format: "any" as const };
  const weeklyHours = parsed.data.weeklyHours ?? profile?.weeklyHours ?? 10;
  const role = await getRole(targetRoleId);

  if (!role) {
    return NextResponse.json({ error: `Unknown role: ${targetRoleId}` }, { status: 404 });
  }

  const roleSkillIds = new Set(role.requiredSkills.map((required) => required.skillId));
  let outcome = null;

  if (assessment) {
    // Transitive dependents come from the graph, not a BFS in app code.
    const downstream = await findDownstreamSkills(assessment.skillId);
    const [assessedSkill] = await getSkillsByIds([assessment.skillId]);
    const raw = applyAssessmentOutcome({
      skillId: assessment.skillId,
      skillName: assessedSkill?.name ?? assessment.skillId,
      assessmentScore: assessment.score,
      finishedEarly: assessment.finishedEarly,
      downstreamSkillIds: downstream,
      candidateResources: await findResourcesBySkill(assessment.skillId),
      mastery
    });

    // The graph spans every domain; only report delays this learner cares about.
    outcome = { ...raw, delayedSkillIds: raw.delayedSkillIds.filter((id) => roleSkillIds.has(id)) };
  }

  const { gaps } = await buildRoadmap(targetRoleId, mastery);
  const delayed = new Set(outcome?.delayedSkillIds ?? []);
  const plannableGaps = gaps.filter((gap) => !delayed.has(gap.skill.id));

  return NextResponse.json({
    outcome,
    plan: planWeek({
      gaps: plannableGaps,
      candidatesBySkill: await candidatesBySkill(plannableGaps, mastery, preferences, weeklyHours),
      weeklyHours,
      excludeResourceIds,
      // The remediation the outcome promises must actually appear in the week.
      pinnedBySkill: outcome?.remediation ? { [assessment!.skillId]: outcome.remediation.id } : {}
    })
  });
}
