import { describe, expect, it } from "vitest";
import { computeAverageQuizScore, computeHoursInvested, predictTimeline, readinessFor } from "./timeline";
import type { LearningEvent } from "@/lib/adaptation/mastery";
import type { LearnerProfile, Role, SkillGraph } from "@/lib/types";

const ROLE: Role = {
  id: "soc-analyst",
  domainId: "cyber",
  title: "SOC Analyst",
  description: "",
  requiredSkills: [
    { skillId: "logs", importance: 1 },
    { skillId: "siem", importance: 0.5 }
  ]
};

const GRAPH: SkillGraph = {
  skills: [
    { id: "logs", domainId: "cyber", name: "Logs", category: "core", description: "", prerequisites: [] },
    { id: "siem", domainId: "cyber", name: "SIEM", category: "core", description: "", prerequisites: [] }
  ]
};

const profile = (weeklyHours: number): LearnerProfile =>
  ({ weeklyHours }) as unknown as LearnerProfile;

const event = (over: Partial<LearningEvent> = {}): LearningEvent => ({
  learnerId: "l1",
  verb: "quiz_completed",
  objectType: "resource",
  objectId: "r1",
  skillId: "logs",
  score: 0.8,
  durationMinutes: 60,
  timestamp: "2026-01-01T00:00:00.000Z",
  ...over
});

describe("readinessFor", () => {
  it("weights by importance", () => {
    expect(readinessFor(ROLE, { logs: 1, siem: 0 })).toBeCloseTo(1 / 1.5);
  });

  it("returns 0 rather than NaN when nothing is required", () => {
    expect(readinessFor({ ...ROLE, requiredSkills: [] }, {})).toBe(0);
    expect(
      readinessFor({ ...ROLE, requiredSkills: [{ skillId: "logs", importance: 0 }] }, { logs: 1 })
    ).toBe(0);
  });
});

describe("predictTimeline", () => {
  it("stays bounded when the learner has no weekly budget", () => {
    // weeklyHours 0 used to make weeksToComplete Infinity, and the chart loop
    // below it ran forever — a hung request, not a wrong number.
    const prediction = predictTimeline({
      profile: profile(0),
      mastery: {},
      role: ROLE,
      graph: GRAPH,
      events: []
    });

    expect(Number.isFinite(prediction.expected)).toBe(true);
    expect(prediction.dataPoints.length).toBeLessThanOrEqual(109);
    expect(prediction.dataPoints.every((point) => Number.isFinite(point.readiness))).toBe(true);
  });

  it("caps the horizon for a tiny budget and a long way to go", () => {
    const prediction = predictTimeline({
      profile: profile(1),
      mastery: {},
      role: ROLE,
      graph: GRAPH,
      events: []
    });

    expect(prediction.high).toBeLessThanOrEqual(104);
    expect(prediction.dataPoints.length).toBeLessThanOrEqual(109);
  });

  it("counts only skills below the mastery threshold as gaps", () => {
    const prediction = predictTimeline({
      profile: profile(8),
      mastery: { logs: 0.9, siem: 0.2 },
      role: ROLE,
      graph: GRAPH,
      events: []
    });

    expect(prediction.gapCount).toBe(1);
  });

  it("finishes sooner for a learner scoring well than one scoring badly", () => {
    const base = { profile: profile(8), mastery: {}, role: ROLE, graph: GRAPH };
    const strong = predictTimeline({ ...base, events: [event({ score: 1 })] });
    const weak = predictTimeline({ ...base, events: [event({ score: 0 })] });

    expect(strong.expected).toBeLessThanOrEqual(weak.expected);
  });

  it("never reports readiness above 1 or below 0", () => {
    const prediction = predictTimeline({
      profile: profile(40),
      mastery: { logs: 0.5 },
      role: ROLE,
      graph: GRAPH,
      events: [event()]
    });

    for (const point of prediction.dataPoints) {
      expect(point.readiness).toBeGreaterThanOrEqual(0);
      expect(point.readiness).toBeLessThanOrEqual(1);
      expect(point.lower).toBeGreaterThanOrEqual(0);
      expect(point.upper).toBeLessThanOrEqual(1);
    }
  });
});

describe("event aggregates", () => {
  it("assumes 50% with no scored events, rather than 0", () => {
    expect(computeAverageQuizScore([])).toBe(0.5);
    expect(computeAverageQuizScore([event({ verb: "feedback_submitted" })])).toBe(0.5);
  });

  it("averages only scored learning events", () => {
    expect(computeAverageQuizScore([event({ score: 1 }), event({ score: 0.5 })])).toBe(0.75);
  });

  it("sums duration in hours", () => {
    expect(computeHoursInvested([event({ durationMinutes: 90 }), event({ durationMinutes: 30 })])).toBe(2);
  });
});
