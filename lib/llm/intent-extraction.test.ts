import { describe, expect, it } from "vitest";
import { CRITICAL_FIELDS, MAX_FOLLOW_UPS, buildIntentSchema, needsFollowUp } from "@/lib/llm/intent-extraction";
import type { Role } from "@/lib/types";

const roles: Role[] = [
  {
    id: "data-analyst",
    domainId: "data",
    title: "Data Analyst",
    description: "Analyse and communicate data.",
    requiredSkills: []
  },
  {
    id: "soc-analyst",
    domainId: "cybersecurity",
    title: "Junior SOC Analyst",
    description: "Monitor and triage alerts.",
    requiredSkills: []
  }
];

const valid = {
  targetRoleId: "soc-analyst",
  timelineWeeks: 12,
  weeklyHours: 8,
  preferences: { maxHoursPerStep: 2, cost: "free", format: "lab" },
  // The learner-profile fields are required by the schema, so a fixture without
  // them fails for the wrong reason and hides what these tests actually pin:
  // that the role enum is built from seeded data.
  careerObjective: "Become a junior SOC analyst",
  experienceLevel: "beginner",
  currentSkills: ["linux-fundamentals"],
  interests: ["threat detection"],
  learningHistory: [],
  preferredTechnologies: ["Splunk"],
  learningStyle: "hands-on"
};

describe("learner intent validation (LLM trust boundary)", () => {
  it("accepts intent naming a real role", () => {
    expect(buildIntentSchema(roles).parse(valid).targetRoleId).toBe("soc-analyst");
  });

  it("rejects a role the model invented", () => {
    const result = buildIntentSchema(roles).safeParse({ ...valid, targetRoleId: "astronaut" });
    expect(result.success).toBe(false);
  });

  it("builds its role list from the data it is given, not a hardcoded enum", () => {
    // A role that exists in no cybersecurity catalog still validates when seeded.
    expect(buildIntentSchema(roles).safeParse({ ...valid, targetRoleId: "data-analyst" }).success).toBe(true);
    expect(buildIntentSchema([roles[1]]).safeParse({ ...valid, targetRoleId: "data-analyst" }).success).toBe(
      false
    );
  });

  it("clamps out-of-range numbers the model might return", () => {
    const schema = buildIntentSchema(roles);
    expect(schema.safeParse({ ...valid, timelineWeeks: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...valid, timelineWeeks: 999 }).success).toBe(false);
    expect(schema.safeParse({ ...valid, weeklyHours: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...valid, weeklyHours: 200 }).success).toBe(false);
  });

  it("rejects unknown enum values for cost and format", () => {
    const schema = buildIntentSchema(roles);
    expect(schema.safeParse({ ...valid, preferences: { ...valid.preferences, cost: "cheap" } }).success).toBe(
      false
    );
    expect(
      schema.safeParse({ ...valid, preferences: { ...valid.preferences, format: "hologram" } }).success
    ).toBe(false);
  });
});

describe("follow-up decision", () => {
  it("asks when the model guessed something that shapes the roadmap", () => {
    for (const field of CRITICAL_FIELDS) {
      expect(needsFollowUp([field], 0, "How long do you have?")).toBe(true);
    }
  });

  it("does not ask about guesses that the diagnostic will correct anyway", () => {
    // Format, style and prior skills are all re-measured downstream; the role,
    // the deadline and the weekly budget are not.
    expect(needsFollowUp(["learningStyle", "currentSkills", "preferences"], 0, "Anything else?")).toBe(false);
  });

  it("does not ask when nothing was guessed", () => {
    expect(needsFollowUp([], 0, "How long do you have?")).toBe(false);
  });

  it("does not ask without a question to put", () => {
    expect(needsFollowUp(["weeklyHours"], 0, null)).toBe(false);
    expect(needsFollowUp(["weeklyHours"], 0, "")).toBe(false);
  });

  it("stops after the cap, however much is still assumed", () => {
    expect(needsFollowUp(["targetRoleId"], MAX_FOLLOW_UPS - 1, "One more?")).toBe(true);
    expect(needsFollowUp(["targetRoleId"], MAX_FOLLOW_UPS, "One more?")).toBe(false);
    expect(needsFollowUp(["targetRoleId"], MAX_FOLLOW_UPS + 5, "One more?")).toBe(false);
  });
});

describe("assumption reporting", () => {
  it("defaults to no assumptions and no question when the model omits them", () => {
    const parsed = buildIntentSchema(roles).parse(valid);

    expect(parsed.assumed).toEqual([]);
    expect(parsed.followUpQuestion).toBeNull();
  });

  it("keeps the assumptions the model reports", () => {
    const parsed = buildIntentSchema(roles).parse({
      ...valid,
      assumed: ["weeklyHours", "timelineWeeks"],
      followUpQuestion: "How many hours a week can you give it?"
    });

    expect(parsed.assumed).toEqual(["weeklyHours", "timelineWeeks"]);
    expect(needsFollowUp(parsed.assumed, 0, parsed.followUpQuestion)).toBe(true);
  });
});
