import type { LearnerProfile, MasteryMap, Role, SkillGraph } from "@/lib/types";
import type { LearningEvent } from "@/lib/adaptation/mastery";

/** Two years. Beyond this the estimate is fiction anyway. */
const MAX_WEEKS = 104;

/** Importance-weighted readiness, 0-1. One definition, one divide-by-zero guard. */
export function readinessFor(role: Role, mastery: MasteryMap): number {
  const totalImportance = role.requiredSkills.reduce((sum, rs) => sum + rs.importance, 0);

  if (totalImportance <= 0) {
    return 0;
  }

  return (
    role.requiredSkills.reduce((sum, rs) => sum + (mastery[rs.skillId] ?? 0) * rs.importance, 0) /
    totalImportance
  );
}

export type TimelinePrediction = {
  expected: number;
  low: number;
  high: number;
  remainingHours: number;
  gapCount: number;
  dataPoints: Array<{
    week: number;
    readiness: number;
    lower: number;
    upper: number;
  }>;
};

/** Demonstrated competency so far, from the scored events in the log. */
export function computeAverageQuizScore(events: LearningEvent[]): number {
  const scoredEvents = events.filter(
    (e) =>
      (e.verb === "quiz_completed" || e.verb === "lab_completed" || e.verb === "project_reviewed") &&
      typeof e.score === "number"
  );

  if (scoredEvents.length === 0) {
    return 0.5;
  }

  const sum = scoredEvents.reduce((acc, e) => acc + (e.score ?? 0), 0);
  return sum / scoredEvents.length;
}

/** Hours invested, from the event log. */
export function computeHoursInvested(events: LearningEvent[]): number {
  return events.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0) / 60;
}

/**
 * Weeks to job-readiness: remaining gap hours over the weekly budget, adjusted
 * by how well the learner has been scoring, with a band that widens when there
 * is little evidence to go on. Deterministic — no model call.
 */
export function predictTimeline({
  profile,
  mastery,
  role,
  graph,
  events
}: {
  profile: LearnerProfile | null;
  mastery: MasteryMap;
  role: Role;
  graph: SkillGraph;
  events: LearningEvent[];
}): TimelinePrediction {
  // A zero weekly budget makes weeksToComplete Infinity, and the chart loop
  // below then never terminates.
  const hoursPerWeek = profile?.weeklyHours && profile.weeklyHours > 0 ? profile.weeklyHours : 8;
  const masteryThreshold = 0.8;

  const skillById = new Map(graph.skills.map((s) => [s.id, s]));
  const gaps = role.requiredSkills.filter(
    (rs) => (mastery[rs.skillId] ?? 0) < masteryThreshold
  );

  const AVG_HOURS_PER_SKILL = 8;

  const remainingHours = gaps.reduce((sum, gap) => {
    const skill = skillById.get(gap.skillId);
    if (!skill) return sum + AVG_HOURS_PER_SKILL;

    // Weighted by importance and by how much mastery is still missing.
    const currentMastery = mastery[gap.skillId] ?? 0;
    const remainingMastery = 1 - currentMastery;
    return sum + AVG_HOURS_PER_SKILL * remainingMastery * gap.importance;
  }, 0);

  // Higher scores mean faster learning: 0.7 (struggling) to 1.0 (acing it).
  const efficiencyFactor = 0.7 + computeAverageQuizScore(events) * 0.3;
  const adjustedHours = remainingHours / efficiencyFactor;

  // Capped: an uncapped horizon is an unbounded response body.
  const weeksToComplete = Math.min(MAX_WEEKS, Math.max(1, adjustedHours / hoursPerWeek));

  // Wider band when there is less evidence to go on.
  const eventCount = events.length;
  const variabilityFactor = eventCount < 5 ? 0.35 : eventCount < 10 ? 0.25 : 0.2;
  const low = Math.ceil(weeksToComplete * (1 - variabilityFactor));
  const high = Math.ceil(weeksToComplete * (1 + variabilityFactor));
  const expected = Math.ceil(weeksToComplete);

  const currentReadiness = readinessFor(role, mastery);
  const bufferWeeks = 4;
  const totalWeeks = Math.min(MAX_WEEKS, high + bufferWeeks);
  const dataPoints = [];

  for (let week = 0; week <= totalWeeks; week++) {
    const progress = week / weeksToComplete;
    const readiness = Math.min(1, currentReadiness + (1 - currentReadiness) * progress);
    const bandWidth = variabilityFactor * (1 + week * 0.01);
    const lower = Math.max(0, readiness - bandWidth);
    const upper = Math.min(1, readiness + bandWidth);

    dataPoints.push({
      week,
      readiness: Math.round(readiness * 100) / 100,
      lower: Math.round(lower * 100) / 100,
      upper: Math.round(upper * 100) / 100
    });
  }

  return {
    expected,
    low,
    high,
    remainingHours: Math.round(remainingHours),
    gapCount: gaps.length,
    dataPoints
  };
}
