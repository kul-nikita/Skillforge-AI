import type { ScoredRecommendation } from "@/lib/scoring/recommendations";
import type { Gap, LearnerPreferences, LearningResource, MasteryMap, SkillGraph } from "@/lib/types";

export type WeeklyPlanItem = {
  gapSkillId: string;
  recommendation: ScoredRecommendation;
};

export type DeferredItem = {
  gapSkillId: string;
  gapSkillName: string;
  reason: string;
};

export type WeeklyPlan = {
  weeklyHours: number;
  minutesPlanned: number;
  included: WeeklyPlanItem[];
  deferred: DeferredItem[];
};

/**
 * Fills the week in prerequisite order, so the critical path is what survives
 * a budget cut. Within a gap, the best-scoring resource that still *fits the
 * remaining* budget wins — a shorter alternative beats deferring the skill.
 *
 * Pure bin-packing over already-scored candidates: scoring and data access
 * happen upstream (lib/services), so this stays synchronous and testable.
 */
export function planWeek({
  gaps,
  candidatesBySkill,
  weeklyHours,
  excludeResourceIds = [],
  pinnedBySkill = {}
}: {
  gaps: Gap[];
  candidatesBySkill: Record<string, ScoredRecommendation[]>;
  weeklyHours: number;
  /** Resources the learner marked "not relevant". */
  excludeResourceIds?: string[];
  /** skillId → resourceId that must be used for that gap, e.g. inserted remediation. */
  pinnedBySkill?: Record<string, string>;
}): WeeklyPlan {
  const budgetMinutes = weeklyHours * 60;
  const excluded = new Set(excludeResourceIds);
  const included: WeeklyPlanItem[] = [];
  const deferred: DeferredItem[] = [];
  let minutesPlanned = 0;

  for (const gap of gaps) {
    const candidates = (candidatesBySkill[gap.skill.id] ?? []).filter(
      (item) => !excluded.has(item.resource.id)
    );
    const remaining = budgetMinutes - minutesPlanned;
    const pinnedId = pinnedBySkill[gap.skill.id];
    // A pinned resource (inserted remediation) takes the slot if it fits at all.
    const fits =
      candidates.find((item) => item.resource.id === pinnedId && item.resource.durationMinutes <= remaining) ??
      candidates.find((item) => item.resource.durationMinutes <= remaining);

    if (!fits) {
      const shortest = Math.min(...candidates.map((item) => item.resource.durationMinutes));
      deferred.push({
        gapSkillId: gap.skill.id,
        gapSkillName: gap.skill.name,
        reason:
          candidates.length === 0
            ? "No prerequisite-valid resource available yet — an earlier skill must come first."
            : `Shortest option needs ${shortest} min; only ${remaining} min left this week.`
      });
      continue;
    }

    included.push({ gapSkillId: gap.skill.id, recommendation: fits });
    minutesPlanned += fits.resource.durationMinutes;
  }

  return { weeklyHours, minutesPlanned, included, deferred };
}

export type AssessmentOutcome = {
  action: "insert_remediation_and_delay_dependents" | "retain_plan_with_extra_practice" | "unlock_next_valid_module" | "retain_plan";
  remediation: LearningResource | null;
  delayedSkillIds: string[];
  message: string;
};

/**
 * The adaptation rule from ARCHITECTURE.md. Remediation is picked
 * deterministically: the easiest, shortest resource still teaching the skill.
 */
export function applyAssessmentOutcome({
  skillId,
  skillName = skillId,
  assessmentScore,
  finishedEarly = false,
  downstreamSkillIds,
  candidateResources,
  mastery
}: {
  skillId: string;
  skillName?: string;
  assessmentScore: number;
  finishedEarly?: boolean;
  /** Transitive dependents, supplied by the caller (Cypher at runtime). */
  downstreamSkillIds: string[];
  /** Resources that teach this skill, supplied by the caller (Mongo at runtime). */
  candidateResources: LearningResource[];
  mastery: MasteryMap;
}): AssessmentOutcome {
  if (assessmentScore < 0.6) {
    return {
      action: "insert_remediation_and_delay_dependents",
      remediation: pickRemediation(candidateResources, skillId, mastery),
      delayedSkillIds: downstreamSkillIds,
      message: `Scored ${Math.round(assessmentScore * 100)}% on ${skillName}. Inserting a foundational resource and delaying everything that builds on it.`
    };
  }

  if (assessmentScore <= 0.8) {
    return {
      action: "retain_plan_with_extra_practice",
      remediation: pickRemediation(candidateResources, skillId, mastery),
      delayedSkillIds: [],
      message: `Scored ${Math.round(assessmentScore * 100)}% on ${skillName}. Keeping the plan and adding one extra practice task.`
    };
  }

  if (finishedEarly) {
    return {
      action: "unlock_next_valid_module",
      remediation: null,
      delayedSkillIds: [],
      message: `Scored ${Math.round(assessmentScore * 100)}% on ${skillName} ahead of schedule. Unlocking the next prerequisite-valid module now.`
    };
  }

  return {
    action: "retain_plan",
    remediation: null,
    delayedSkillIds: [],
    message: `Scored ${Math.round(assessmentScore * 100)}% on ${skillName}. Plan unchanged.`
  };
}

const DIFFICULTY_ORDER = { beginner: 0, intermediate: 1, advanced: 2 } as const;

function pickRemediation(resources: LearningResource[], skillId: string, mastery: MasteryMap) {
  const candidates = resources
    .filter((resource) => resource.skillTags.includes(skillId))
    .filter((resource) => resource.prerequisites.every((prereq) => (mastery[prereq] ?? 0) >= 0.6))
    .sort(
      (a, b) =>
        DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty] ||
        a.durationMinutes - b.durationMinutes
    );

  return candidates[0] ?? null;
}

/**
 * Only verbs that map onto a field the scorer reads. "too easy"/"too difficult"
 * would need a difficulty term the scoring formula does not define, and "not
 * relevant" is `excludeResourceIds` on planWeek.
 */
export type FeedbackVerb = "more_hands_on" | "less_time";

/**
 * Feedback nudges preferences, which then re-rank candidates through the same
 * deterministic scorer — feedback never reorders results directly.
 */
export function adjustPreferencesFromFeedback(
  preferences: LearnerPreferences,
  feedback: FeedbackVerb
): LearnerPreferences {
  switch (feedback) {
    case "more_hands_on":
      return { ...preferences, format: "lab" };
    case "less_time":
      return { ...preferences, maxHoursPerStep: Math.max(0.5, preferences.maxHoursPerStep / 2) };
  }
}
