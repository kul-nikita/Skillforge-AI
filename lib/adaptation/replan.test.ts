import { describe, expect, it } from "vitest";
import { learningResources, roles, skillGraph } from "@/lib/data/domains/cybersecurity";
import { planRoadmap } from "@/lib/planner/roadmap";
import {
  adjustPreferencesFromFeedback,
  applyAssessmentOutcome,
  planWeek
} from "@/lib/adaptation/replan";
import { scoreResourcesForGap } from "@/lib/scoring/recommendations";
import type { LearnerPreferences } from "@/lib/types";

const socAnalyst = roles.find((role) => role.id === "soc-analyst")!;
// Fundamentals done, SOC-specific skills still open.
const mastery = {
  "networking-basics": 0.9,
  "linux-fundamentals": 0.9,
  "log-analysis": 0.2,
  "siem-querying": 0.1,
  "alert-triage": 0.1,
  "mitre-attack": 0.1,
  "incident-documentation": 0.1
};
const preferences: LearnerPreferences = { maxHoursPerStep: 4, cost: "free", format: "lab" };
const gaps = planRoadmap({ role: socAnalyst, graph: skillGraph, mastery }).gaps;

// alert-triage depends on siem-querying, which depends on log-analysis. At
// runtime this list comes from Cypher (findDownstreamSkills).
const DOWNSTREAM_OF_LOG_ANALYSIS = ["siem-querying", "alert-triage"];

/** Mirrors what lib/services does at runtime: score first, then pack. */
function candidatesFor(weeklyHours: number) {
  return Object.fromEntries(
    gaps.map((gap) => [
      gap.skill.id,
      scoreResourcesForGap({ gap, resources: learningResources, mastery, preferences, weeklyHours })
    ])
  );
}

function week(weeklyHours: number, excludeResourceIds: string[] = []) {
  return planWeek({
    gaps,
    candidatesBySkill: candidatesFor(weeklyHours),
    weeklyHours,
    excludeResourceIds
  });
}

describe("weekly replanning", () => {
  it("never plans more minutes than the week allows", () => {
    for (const hours of [1, 2, 5, 10, 40]) {
      const plan = week(hours);
      expect(plan.minutesPlanned).toBeLessThanOrEqual(hours * 60);
    }
  });

  it("keeps the critical path when hours are cut and defers the rest", () => {
    const full = week(10);
    const squeezed = week(2);

    expect(squeezed.included.length).toBeLessThan(full.included.length);
    expect(squeezed.deferred.length).toBeGreaterThan(0);
    // Whatever survives the cut must be the earliest gap in prerequisite order.
    expect(squeezed.included[0].gapSkillId).toBe(gaps[0].skill.id);
  });

  it("swaps to a shorter resource rather than dropping the top-priority skill", () => {
    const squeezed = week(2);
    const topGapItem = squeezed.included.find((item) => item.gapSkillId === gaps[0].skill.id);

    expect(topGapItem).toBeDefined();
    expect(topGapItem!.recommendation.resource.durationMinutes).toBeLessThanOrEqual(120);
  });

  it("plans every item in prerequisite order", () => {
    const plan = week(40);
    const order = gaps.map((gap) => gap.skill.id);
    const plannedOrder = plan.included.map((item) => item.gapSkillId);

    expect(plannedOrder).toEqual(order.filter((id) => plannedOrder.includes(id)));
  });

  it("stops recommending a resource the learner marked not relevant", () => {
    const before = week(10);
    const dropped = before.included[0].recommendation.resource.id;
    const after = week(10, [dropped]);

    expect(after.included.map((item) => item.recommendation.resource.id)).not.toContain(dropped);
  });

  it("schedules a pinned remediation instead of the top-scoring resource", () => {
    const outcome = applyAssessmentOutcome({
      skillId: "log-analysis",
      assessmentScore: 0.4,
      downstreamSkillIds: DOWNSTREAM_OF_LOG_ANALYSIS,
      candidateResources: learningResources,
      mastery
    });
    const unpinned = week(10).included.find((item) => item.gapSkillId === "log-analysis")!;
    const pinned = planWeek({
      gaps,
      candidatesBySkill: candidatesFor(10),
      weeklyHours: 10,
      pinnedBySkill: { "log-analysis": outcome.remediation!.id }
    }).included.find((item) => item.gapSkillId === "log-analysis")!;

    expect(unpinned.recommendation.resource.id).not.toBe(outcome.remediation!.id);
    expect(pinned.recommendation.resource.id).toBe(outcome.remediation!.id);
  });

  it("gives an explicit reason for every deferred skill", () => {
    for (const item of week(2).deferred) {
      expect(item.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("assessment outcomes", () => {
  const args = {
    downstreamSkillIds: DOWNSTREAM_OF_LOG_ANALYSIS,
    candidateResources: learningResources,
    mastery
  };

  it("inserts remediation and delays dependents below 0.6", () => {
    const outcome = applyAssessmentOutcome({ ...args, skillId: "log-analysis", assessmentScore: 0.4 });

    expect(outcome.action).toBe("insert_remediation_and_delay_dependents");
    expect(outcome.remediation).not.toBeNull();
    expect(outcome.remediation!.skillTags).toContain("log-analysis");
    expect(outcome.delayedSkillIds).toContain("siem-querying");
  });

  it("picks the easiest available resource as remediation", () => {
    const outcome = applyAssessmentOutcome({ ...args, skillId: "log-analysis", assessmentScore: 0.4 });

    expect(outcome.remediation!.difficulty).toBe("beginner");
  });

  it("retains the plan with extra practice between 0.6 and 0.8", () => {
    const outcome = applyAssessmentOutcome({ ...args, skillId: "log-analysis", assessmentScore: 0.7 });

    expect(outcome.action).toBe("retain_plan_with_extra_practice");
    expect(outcome.delayedSkillIds).toEqual([]);
  });

  it("unlocks the next module above 0.8 only when finished early", () => {
    const early = applyAssessmentOutcome({
      ...args,
      skillId: "log-analysis",
      assessmentScore: 0.9,
      finishedEarly: true
    });
    const onTime = applyAssessmentOutcome({ ...args, skillId: "log-analysis", assessmentScore: 0.9 });

    expect(early.action).toBe("unlock_next_valid_module");
    expect(onTime.action).toBe("retain_plan");
  });
});

describe("feedback adjustments", () => {
  it("switches the format preference to labs for more hands-on", () => {
    expect(adjustPreferencesFromFeedback(preferences, "more_hands_on").format).toBe("lab");
  });

  it("halves the session length for less time, with a floor", () => {
    expect(adjustPreferencesFromFeedback(preferences, "less_time").maxHoursPerStep).toBe(2);
    expect(
      adjustPreferencesFromFeedback({ ...preferences, maxHoursPerStep: 0.5 }, "less_time").maxHoursPerStep
    ).toBe(0.5);
  });
});
