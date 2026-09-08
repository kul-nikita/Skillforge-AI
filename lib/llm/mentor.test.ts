import { describe, expect, it } from "vitest";
import { CANNOT_ANSWER, UNAVAILABLE, mentorAllowedNumbers, type MentorFacts } from "./mentor";
import { findViolations } from "./grounded-explanations";

const FACTS: MentorFacts = {
  roleTitle: "SOC Analyst",
  objective: "Become a junior SOC analyst",
  experienceLevel: "beginner",
  interests: ["threat detection"],
  knownSkills: ["Python"],
  completedCourses: ["CS50"],
  readinessPercent: 24,
  masteredSkills: ["Networking Basics"],
  gaps: [
    { skill: "Log Analysis", masteryPercent: 10, blockedBy: [] },
    { skill: "SIEM Querying", masteryPercent: 0, blockedBy: ["Log Analysis"] }
  ],
  nextResources: [{ title: "Splunk Search Tutorial", provider: "Splunk", durationMinutes: 240 }],
  evidenceCount: 2
};

const check = (text: string) => findViolations(text, mentorAllowedNumbers(FACTS));

describe("mentor grounding", () => {
  it("permits every number in the pack", () => {
    expect(check("Readiness is 24%, Log Analysis sits at 10%, and you have 2 evidence items.")).toEqual([]);
  });

  it("permits a duration restated in hours", () => {
    expect(check("Splunk Search Tutorial takes about 4 hours.")).toEqual([]);
  });

  it("permits the learner's own stated profile without widening the number set", () => {
    // Strings the learner supplied are quotable; they add no permitted numbers.
    expect(check("You said you want to become a junior SOC analyst and already know Python.")).toEqual([]);
    expect(check("You have done 3 courses.")).toEqual([{ kind: "number", detail: "3" }]);
  });

  it("permits counting the collections it was given", () => {
    // Two gaps, one mastered skill, one resource — all legitimately countable.
    expect(check("You have 2 open gaps and 1 mastered skill.")).toEqual([]);
  });

  it("rejects an invented percentage", () => {
    expect(check("You are 73% of the way there.")).toEqual([{ kind: "number", detail: "73" }]);
  });

  it("rejects a salary or price", () => {
    expect(check("Analysts earn $90000.").some((v) => v.kind === "claim" || v.kind === "number")).toBe(true);
  });

  it("rejects a URL and a certificate promise", () => {
    expect(check("Try tryhackme.com next.").some((v) => v.kind === "url")).toBe(true);
    expect(check("This earns you a certificate.").some((v) => v.kind === "claim")).toBe(true);
  });

  it("distinguishes an outage from a refusal", () => {
    // Telling a learner their question is off-topic when the model was simply
    // unreachable is a lie about their own data.
    expect(UNAVAILABLE).not.toBe(CANNOT_ANSWER);
    expect(UNAVAILABLE.toLowerCase()).toContain("try again");
    expect(check(UNAVAILABLE)).toEqual([]);
  });

  it("has a refusal that passes its own guard", () => {
    // The refusal is shown verbatim on any failure, so it must never itself trip
    // the checker — otherwise a fallback would be rejected as ungrounded.
    expect(check(CANNOT_ANSWER)).toEqual([]);
  });

  it("does not permit numbers merely adjacent to the pack", () => {
    // 25 is one off from readiness; the guard is exact, not approximate.
    expect(check("Readiness is 25%.")).toEqual([{ kind: "number", detail: "25" }]);
  });
});
