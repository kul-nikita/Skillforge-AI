import { getMastery, getProfile, listEvents, listEvidence } from "@/lib/db/learners";
import { getRole } from "@/lib/graph/queries";
import { buildRoadmap, candidatesForGap } from "@/lib/services/recommendations";
import { currentStage, type JourneyStage } from "@/lib/services/journey";
import { DEFAULT_PREFERENCES, DEFAULT_WEEKLY_HOURS } from "@/lib/constants";
import type { Gap, LearningResource, MasteryMap, Role } from "@/lib/types";
import type { LearningEvent } from "@/lib/adaptation/mastery";
import type { Evidence } from "@/lib/types";

/**
 * One read of everything a coaching surface needs, derived on the server.
 *
 * The AI features are only safe because their facts are computed here rather
 * than accepted from the caller — the same rule /api/explain follows. Sharing
 * one loader also stops the dashboard, the coach and the mentor drifting into
 * three slightly different opinions about what the learner's next step is.
 */
export type LearnerState = {
  profile: Awaited<ReturnType<typeof getProfile>>;
  events: LearningEvent[];
  evidence: Evidence[];
  mastery: MasteryMap;
  stage: JourneyStage;
  role: Role | null;
  readiness: number;
  gaps: Gap[];
  /** The best-scoring resource for the first gap the learner is ready for. */
  nextResource: LearningResource | null;
  nextGap: Gap | null;
};

export async function loadLearnerState(learnerId: string): Promise<LearnerState> {
  const [profile, events, evidence, mastery] = await Promise.all([
    getProfile(learnerId),
    listEvents(learnerId),
    listEvidence(learnerId),
    getMastery(learnerId)
  ]);

  const stage = currentStage({ profile, events, evidence });
  const roleId = profile?.targetRoleId;

  if (!roleId) {
    return {
      profile,
      events,
      evidence,
      mastery,
      stage,
      role: null,
      readiness: 0,
      gaps: [],
      nextResource: null,
      nextGap: null
    };
  }

  const [role, roadmap] = await Promise.all([getRole(roleId), buildRoadmap(roleId, mastery)]);

  const nextGap =
    roadmap.gaps.find((gap) => gap.skill.prerequisites.every((id) => (mastery[id] ?? 0) >= 0.6)) ??
    roadmap.gaps[0] ??
    null;

  const candidates = nextGap
    ? await candidatesForGap(
        nextGap,
        mastery,
        profile?.preferences ?? DEFAULT_PREFERENCES,
        profile?.weeklyHours ?? DEFAULT_WEEKLY_HOURS
      )
    : [];

  return {
    profile,
    events,
    evidence,
    mastery,
    stage,
    role,
    readiness: roadmap.readiness,
    gaps: roadmap.gaps,
    nextResource: candidates[0]?.resource ?? null,
    nextGap
  };
}
