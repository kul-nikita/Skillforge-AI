import { describe, expect, it } from "vitest";
import { buildMilestones } from "./milestones";
import { planRoadmap } from "./roadmap";
import { roles, skillGraph } from "@/lib/data/domains/cybersecurity";
import { demoLearnerMastery } from "@/lib/data/demo-learner";
import type { Gap, Skill } from "@/lib/types";

const skill = (id: string, prerequisites: string[] = []): Skill => ({
  id,
  domainId: "d",
  name: id.toUpperCase(),
  category: "core",
  description: "",
  prerequisites
});

const gap = (id: string, prerequisites: string[] = [], mastery = 0): Gap => ({
  skill: skill(id, prerequisites),
  importance: 1,
  currentMastery: mastery,
  reason: ""
});

describe("milestones", () => {
  it("puts everything startable today in the first milestone", () => {
    const milestones = buildMilestones([gap("a"), gap("b"), gap("c", ["a"])], []);

    expect(milestones[0].skills.map((s) => s.skill.id).sort()).toEqual(["a", "b"]);
    expect(milestones[1].skills.map((s) => s.skill.id)).toEqual(["c"]);
  });

  it("layers by the deepest prerequisite, not the first one found", () => {
    // d depends on a (depth 0) and c (depth 1), so d belongs at depth 2.
    const milestones = buildMilestones([gap("a"), gap("c", ["a"]), gap("d", ["a", "c"])], []);

    expect(milestones).toHaveLength(3);
    expect(milestones[2].skills.map((s) => s.skill.id)).toEqual(["d"]);
  });

  it("ignores prerequisites outside the role", () => {
    // A skill whose only prerequisite the role never asks for is startable now.
    const milestones = buildMilestones([gap("a", ["not-in-this-role"])], []);

    expect(milestones).toHaveLength(1);
    expect(milestones[0].skills.map((s) => s.skill.id)).toEqual(["a"]);
  });

  it("marks a layer complete when every skill in it is mastered", () => {
    const milestones = buildMilestones([gap("c", ["a"])], [gap("a", [], 0.9)]);

    expect(milestones[0].complete).toBe(true);
    expect(milestones[0].clearedSkills.map((s) => s.skill.id)).toEqual(["a"]);
    expect(milestones[1].complete).toBe(false);
  });

  it("marks exactly one milestone as current — the first with work left", () => {
    const milestones = buildMilestones([gap("c", ["a"]), gap("d", ["c"])], [gap("a", [], 0.9)]);

    expect(milestones.filter((m) => m.current)).toHaveLength(1);
    expect(milestones.find((m) => m.current)?.skills[0].skill.id).toBe("c");
  });

  it("has no current milestone when the whole path is cleared", () => {
    const milestones = buildMilestones([], [gap("a", [], 0.9), gap("b", ["a"], 0.85)]);

    expect(milestones.every((m) => m.complete)).toBe(true);
    expect(milestones.some((m) => m.current)).toBe(false);
  });

  it("returns nothing for a role with no skills", () => {
    expect(buildMilestones([], [])).toEqual([]);
  });

  it("names a milestone after what it contains", () => {
    expect(buildMilestones([gap("a")], [])[0].title).toBe("A");
    expect(buildMilestones([gap("a"), gap("b")], [])[0].title).toBe("A and B");
    expect(buildMilestones([gap("a"), gap("b"), gap("c")], [])[0].title).toBe("A and 2 more");
  });

  it("survives a prerequisite cycle instead of recursing forever", () => {
    const cyclic = [gap("a", ["b"]), gap("b", ["a"])];
    expect(() => buildMilestones(cyclic, [])).not.toThrow();
  });

  it("covers every role skill exactly once on real seeded data", () => {
    const plan = planRoadmap({ role: roles[0], graph: skillGraph, mastery: demoLearnerMastery });
    const milestones = buildMilestones(plan.gaps, plan.mastered);
    const seen = milestones.flatMap((m) => [...m.skills, ...m.clearedSkills]).map((g) => g.skill.id);

    expect(seen.length).toBe(plan.gaps.length + plan.mastered.length);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("never places a skill before one of its prerequisites on real data", () => {
    const plan = planRoadmap({ role: roles[0], graph: skillGraph, mastery: demoLearnerMastery });
    const milestones = buildMilestones(plan.gaps, plan.mastered);
    const indexOf = new Map<string, number>();

    for (const milestone of milestones) {
      for (const item of [...milestone.skills, ...milestone.clearedSkills]) {
        indexOf.set(item.skill.id, milestone.index);
      }
    }

    for (const [id, index] of indexOf) {
      const item = [...plan.gaps, ...plan.mastered].find((g) => g.skill.id === id)!;
      for (const prerequisiteId of item.skill.prerequisites) {
        const prerequisiteIndex = indexOf.get(prerequisiteId);
        if (prerequisiteIndex !== undefined) {
          expect(prerequisiteIndex).toBeLessThan(index);
        }
      }
    }
  });
});
