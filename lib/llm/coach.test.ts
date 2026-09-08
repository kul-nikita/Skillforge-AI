import { describe, expect, it } from "vitest";
import { coachAllowedNumbers, deterministicCoachNote, type CoachFacts } from "./coach";
import { findViolations } from "./grounded-explanations";

const FACTS: CoachFacts = {
  stage: {
    id: "learn",
    step: 3,
    total: 4,
    title: "Do the first thing on your path",
    why: "Your first step is the one you are ready for."
  },
  roleTitle: "SOC Analyst",
  readinessPercent: 24,
  openGaps: 7,
  nextSkillName: "Log Analysis",
  nextResource: { title: "Splunk Search Tutorial", provider: "Splunk", durationMinutes: 240 }
};

const check = (text: string, facts: CoachFacts = FACTS) =>
  findViolations(text, coachAllowedNumbers(facts));

describe("coach grounding", () => {
  it("permits the numbers it was given", () => {
    expect(check("You are on step 3 of 4, readiness 24%, 7 gaps left, about 240 minutes.")).toEqual([]);
  });

  it("permits the duration in whole hours", () => {
    // 240 minutes is 4 hours; a coach saying "4 hours" is still grounded.
    expect(check("Spend about 4 hours on it.")).toEqual([]);
  });

  it("rejects an invented number", () => {
    const violations = check("This takes about 90 minutes.");
    expect(violations).toEqual([{ kind: "number", detail: "90" }]);
  });

  it("rejects an invented URL", () => {
    expect(check("Go to splunk.com to start.").some((v) => v.kind === "url")).toBe(true);
  });

  it("rejects a price or a credential promise", () => {
    expect(check("It costs $30.").some((v) => v.kind === "claim" || v.kind === "number")).toBe(true);
    expect(check("You will earn a certificate.").some((v) => v.kind === "claim")).toBe(true);
  });

  it("widens the allowed set for a completion, and no further", () => {
    const facts: CoachFacts = {
      ...FACTS,
      justCompleted: { skillNames: ["Log Analysis"], scorePercent: 80, unlockedSkillNames: ["SIEM Querying"] }
    };

    expect(check("You scored 80% and unlocked 1 skill.", facts)).toEqual([]);
    expect(check("You scored 95%.", facts)).toEqual([{ kind: "number", detail: "95" }]);
  });
});

describe("deterministic note", () => {
  it("names the next resource and skill when there is one", () => {
    const text = deterministicCoachNote(FACTS);

    expect(text).toContain("Splunk Search Tutorial");
    expect(text).toContain("Log Analysis");
    expect(check(text)).toEqual([]);
  });

  it("still says something useful with no resource to point at", () => {
    const text = deterministicCoachNote({ ...FACTS, nextResource: null, nextSkillName: null });

    expect(text).toBe(FACTS.stage.why);
    expect(text.length).toBeGreaterThan(0);
  });

  it("narrates a completion in terms of what moved", () => {
    const text = deterministicCoachNote({
      ...FACTS,
      justCompleted: { skillNames: ["Log Analysis"], scorePercent: 80, unlockedSkillNames: ["SIEM Querying"] }
    });

    expect(text).toContain("80%");
    expect(text).toContain("SIEM Querying");
    expect(check(text, {
      ...FACTS,
      justCompleted: { skillNames: ["Log Analysis"], scorePercent: 80, unlockedSkillNames: ["SIEM Querying"] }
    })).toEqual([]);
  });

  it("is itself grounded — the fallback can never violate its own guard", () => {
    // If the deterministic sentence could trip the checker, a model outage would
    // put ungrounded text on screen.
    for (const facts of [FACTS, { ...FACTS, nextResource: null, nextSkillName: null }]) {
      expect(check(deterministicCoachNote(facts), facts)).toEqual([]);
    }
  });
});
