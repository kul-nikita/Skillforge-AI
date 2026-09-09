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
  graphSkillId: null,
  isCredential: false,
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

describe("matchJDSkillsToGraph — posting requirements onto real skills", () => {
  it("counts one graph skill once, however many ways the posting names it", () => {
    // A posting asking for "TCP/IP", "DNS" and "HTTP/HTTPS" is asking for one
    // networking skill. Counting three would weight it triple in the score and
    // tell the learner they have three separate gaps.
    const result = matchJDSkillsToGraph(
      [
        parsed("TCP/IP", { graphSkillId: "logs", confidence: 0.8 }),
        parsed("DNS", { graphSkillId: "logs", confidence: 0.9 }),
        parsed("HTTP/HTTPS", { graphSkillId: "logs", confidence: 0.7 })
      ],
      GRAPH,
      { logs: 0.9 },
      ROLE
    );

    expect(result.matched).toHaveLength(1);
    // The clearest statement of the requirement is the one kept.
    expect(result.matched[0].parsedSkill.name).toBe("DNS");
  });

  it("keeps a skill required if any mention of it was required", () => {
    const result = matchJDSkillsToGraph(
      [
        parsed("Splunk", { graphSkillId: "siem", confidence: 0.9, required: false }),
        parsed("SIEM", { graphSkillId: "siem", confidence: 0.5, required: true })
      ],
      GRAPH,
      {},
      ROLE
    );

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].parsedSkill.required).toBe(true);
  });

  it("separates certifications instead of listing them as missing skills", () => {
    // OSCP is proof, not a skill. Nothing in the catalogue teaches it, so
    // showing it as a gap points the learner at a step that does not exist.
    const result = matchJDSkillsToGraph(
      [parsed("OSCP", { isCredential: true }), parsed("SIEM Querying", { graphSkillId: "siem" })],
      GRAPH,
      {},
      ROLE
    );

    expect(result.credentials.map((c) => c.name)).toEqual(["OSCP"]);
    expect(result.unmatched).toEqual([]);
    expect(result.matched).toHaveLength(1);
  });

  it("still matches on name when the model mapped nothing", () => {
    const result = matchJDSkillsToGraph([parsed("log analysis")], GRAPH, { logs: 0.9 }, ROLE);

    expect(result.matched[0].graphSkill.id).toBe("logs");
  });

  it("leaves a requirement the graph genuinely does not cover unmatched", () => {
    const result = matchJDSkillsToGraph([parsed("Kubernetes")], GRAPH, {}, ROLE);

    expect(result.unmatched.map((u) => u.name)).toEqual(["Kubernetes"]);
  });
});
