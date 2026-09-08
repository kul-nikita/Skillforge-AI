import { describe, expect, it } from "vitest";
import { roles, skillGraph } from "@/lib/data/domains/cybersecurity";
import { demoLearnerMastery } from "@/lib/data/demo-learner";
import { planRoadmap, prerequisitesSatisfied } from "@/lib/planner/roadmap";

describe("planner", () => {
  it("orders missing skills before their dependents", () => {
    const plan = planRoadmap({
      role: roles[0],
      graph: skillGraph,
      mastery: demoLearnerMastery
    });

    const gapIds = plan.gaps.map((gap) => gap.skill.id);

    expect(gapIds.indexOf("log-analysis")).toBeLessThan(gapIds.indexOf("siem-querying"));
    expect(gapIds.indexOf("siem-querying")).toBeLessThan(gapIds.indexOf("alert-triage"));
  });

  it("uses mastery scores instead of binary completion", () => {
    expect(prerequisitesSatisfied({ prerequisites: ["linux-fundamentals"] }, demoLearnerMastery)).toBe(false);
    expect(prerequisitesSatisfied({ prerequisites: ["networking-basics"] }, demoLearnerMastery)).toBe(true);
  });

  it("names a missing grandparent skill, not just the direct prerequisite", () => {
    // alert-triage <- siem-querying <- log-analysis. With only the grandparent
    // missing, a one-level check called alert-triage "unlocked" while the Cypher
    // gate still filtered out every resource for it.
    const plan = planRoadmap({
      role: roles[0],
      graph: skillGraph,
      mastery: { ...demoLearnerMastery, "siem-querying": 0.9, "log-analysis": 0 }
    });

    const reason = plan.gaps.find((gap) => gap.skill.id === "alert-triage")?.reason ?? "";

    expect(reason).toContain("Build prerequisite evidence first");
    expect(reason).toContain("Log Analysis");
  });

  it("reports readiness as 0 rather than NaN for a role with no required skills", () => {
    const plan = planRoadmap({
      role: { ...roles[0], requiredSkills: [] },
      graph: skillGraph,
      mastery: {}
    });

    expect(plan.readiness).toBe(0);
    expect(plan.gaps).toEqual([]);
  });
});
