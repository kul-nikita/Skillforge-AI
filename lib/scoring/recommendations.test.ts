import { describe, expect, it } from "vitest";
import { formatDuration, scoreResourcesForGap } from "@/lib/scoring/recommendations";
import type { Gap, LearnerPreferences, LearningResource } from "@/lib/types";

/**
 * Fixtures rather than the demo catalog: these assert scoring *behaviour*, so
 * they must not break every time a resource is added to the catalog.
 */
function resource(overrides: Partial<LearningResource> & { id: string }): LearningResource {
  return {
    title: `Resource ${overrides.id}`,
    provider: "Test Provider",
    url: `https://example.test/${overrides.id}`,
    resourceType: "lab",
    skillTags: ["siem-querying"],
    difficulty: "intermediate",
    durationMinutes: 60,
    costType: "free",
    language: "en",
    qualityScore: 0.8,
    isCurated: true,
    prerequisites: [],
    evidenceType: "siem-query-screenshot",
    lastVerifiedAt: "2026-08-25",
    description: "Fixture resource.",
    ...overrides
  };
}

const gap: Gap = {
  skill: {
    id: "siem-querying",
    domainId: "cybersecurity",
    name: "SIEM Querying",
    category: "detection",
    description: "Query and pivot on security event data.",
    prerequisites: ["log-analysis"]
  },
  importance: 1,
  currentMastery: 0.1,
  reason: "Below target mastery.",
  blockedBy: [],
  unlocks: []
};

const preferences: LearnerPreferences = { maxHoursPerStep: 6, cost: "free", format: "lab" };

describe("recommendation scoring", () => {
  it("drops resources whose prerequisites are not satisfied before scoring", () => {
    const recommendations = scoreResourcesForGap({
      gap,
      resources: [resource({ id: "needs-linux", prerequisites: ["linux-fundamentals"] })],
      mastery: { "linux-fundamentals": 0.58 },
      preferences
    });

    expect(recommendations).toHaveLength(0);
  });

  it("keeps a resource once its prerequisites clear the 0.6 gate", () => {
    const recommendations = scoreResourcesForGap({
      gap,
      resources: [resource({ id: "needs-linux", prerequisites: ["linux-fundamentals"] })],
      mastery: { "linux-fundamentals": 0.61 },
      preferences
    });

    expect(recommendations).toHaveLength(1);
  });

  it("drops resources that produce no evidence artifact", () => {
    const recommendations = scoreResourcesForGap({
      gap,
      resources: [resource({ id: "no-evidence", evidenceType: null })],
      mastery: {},
      preferences
    });

    expect(recommendations).toHaveLength(0);
  });

  it("drops resources tagged for a different skill", () => {
    const recommendations = scoreResourcesForGap({
      gap,
      resources: [resource({ id: "other-skill", skillTags: ["cloud-logging"] })],
      mastery: {},
      preferences
    });

    expect(recommendations).toHaveLength(0);
  });

  it("down-ranks rather than drops a resource longer than the preferred session length", () => {
    const long = [resource({ id: "long-course", durationMinutes: 240 })];

    const short = scoreResourcesForGap({
      gap,
      resources: long,
      mastery: {},
      preferences: { ...preferences, maxHoursPerStep: 2 },
      weeklyHours: 8
    });
    const generous = scoreResourcesForGap({
      gap,
      resources: long,
      mastery: {},
      preferences: { ...preferences, maxHoursPerStep: 6 },
      weeklyHours: 8
    });

    expect(short).toHaveLength(1);
    expect(short[0].score.timeFit).toBeLessThan(generous[0].score.timeFit);
  });

  it("drops a resource that cannot fit the weekly time budget at all", () => {
    const recommendations = scoreResourcesForGap({
      gap,
      resources: [resource({ id: "long-course", durationMinutes: 240 })],
      mastery: {},
      preferences,
      weeklyHours: 1
    });

    expect(recommendations).toHaveLength(0);
  });

  it("ranks the higher-quality resource first when all else is equal", () => {
    const recommendations = scoreResourcesForGap({
      gap,
      resources: [resource({ id: "meh", qualityScore: 0.5 }), resource({ id: "great", qualityScore: 0.95 })],
      mastery: {},
      preferences
    });

    expect(recommendations.map((item) => item.resource.id)).toEqual(["great", "meh"]);
  });

  it("formats durations without the '1 hours' plural bug", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 hour");
    expect(formatDuration(90)).toBe("1.5 hours");
    expect(formatDuration(240)).toBe("4 hours");
  });

  it("returns all six visible score components for explainability", () => {
    const [recommendation] = scoreResourcesForGap({
      gap,
      resources: [resource({ id: "explainable" })],
      mastery: {},
      preferences
    });

    expect(Object.keys(recommendation.score)).toEqual([
      "gapMatch",
      "prereqReadiness",
      "quality",
      "preferenceFit",
      "timeFit",
      "costFit",
      "total"
    ]);
    expect(recommendation.explanation.evidenceArtifact).toBe("siem-query-screenshot");
  });
});
