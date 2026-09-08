import { describe, expect, it } from "vitest";
import { computeRoleMatchScore, matchJDSkillsToGraph, type ParsedSkill } from "./jd-parsing";
import type { Role, SkillGraph } from "@/lib/types";

const GRAPH: SkillGraph = {
  skills: [
    { id: "siem", domainId: "cyber", name: "SIEM", category: "core", description: "", prerequisites: [] },
    { id: "logs", domainId: "cyber", name: "Log Analysis", category: "core", description: "", prerequisites: [] }
  ]
};

const ROLE: Role = {
  id: "soc-analyst",
  domainId: "cyber",
  title: "SOC Analyst",
  description: "",
  requiredSkills: [
    { skillId: "siem", importance: 1 },
    { skillId: "logs", importance: 0.5 }
  ]
};

const parsed = (name: string, over: Partial<ParsedSkill> = {}): ParsedSkill => ({
  name,
  required: true,
  confidence: 1,
  originalText: name,
  ...over
});

describe("matchJDSkillsToGraph", () => {
  it("matches on name, case-insensitively, and reports the rest as unmatched", () => {
    const result = matchJDSkillsToGraph(
      [parsed("siem"), parsed("Log Analysis"), parsed("Kubernetes")],
      GRAPH,
      { siem: 0.9, logs: 0.65 },
      ROLE
    );

    expect(result.matched.map((m) => m.graphSkill.id)).toEqual(["siem", "logs"]);
    expect(result.unmatched.map((s) => s.name)).toEqual(["Kubernetes"]);
  });

  it("grades mastery into mastered / partial / missing", () => {
    const result = matchJDSkillsToGraph(
      [parsed("SIEM"), parsed("Log Analysis")],
      GRAPH,
      { siem: 0.85, logs: 0.1 },
      ROLE
    );

    expect(result.matched.map((m) => m.status)).toEqual(["mastered", "missing"]);
  });

  it("scores 0 rather than NaN when nothing matched", () => {
    const result = matchJDSkillsToGraph([parsed("Kubernetes")], GRAPH, {}, ROLE);

    expect(result.overallMatch).toBe(0);
    expect(result.requiredMatch).toBe(0);
  });

  it("counts a mastered required skill as a full match", () => {
    const result = matchJDSkillsToGraph([parsed("SIEM")], GRAPH, { siem: 1 }, ROLE);

    expect(result.overallMatch).toBe(1);
    expect(result.requiredMatch).toBe(1);
  });
});

describe("computeRoleMatchScore", () => {
  it("weights each skill by its importance to the role", () => {
    const { overall, perSkill } = computeRoleMatchScore(ROLE, GRAPH, { siem: 1, logs: 0 });

    expect(overall).toBeCloseTo(1 / 1.5);
    expect(perSkill.map((s) => s.skillName)).toEqual(["SIEM", "Log Analysis"]);
  });

  it("falls back to the skill id when the graph has no such skill", () => {
    const role: Role = { ...ROLE, requiredSkills: [{ skillId: "ghost", importance: 1 }] };
    expect(computeRoleMatchScore(role, GRAPH, {}).perSkill[0].skillName).toBe("ghost");
  });

  it("returns 0 rather than NaN for a role with no required skills", () => {
    // Divide-by-zero here used to serialize as null and render "NaN%".
    expect(computeRoleMatchScore({ ...ROLE, requiredSkills: [] }, GRAPH, {}).overall).toBe(0);
  });
});
