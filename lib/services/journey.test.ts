import { describe, expect, it } from "vitest";
import { TOTAL_STEPS, currentStage } from "./journey";
import type { LearningEvent } from "@/lib/adaptation/mastery";

const profile = { targetRoleId: "soc-analyst" };
const diagnostic = { verb: "diagnostic_answered" as LearningEvent["verb"] };
const quiz = { verb: "quiz_completed" as LearningEvent["verb"] };
const evidence = [{ id: "ev-1" }];

describe("journey stages", () => {
  it("starts at the goal when there is no profile", () => {
    const stage = currentStage({ profile: null, events: [], evidence: [] });

    expect(stage.id).toBe("goal");
    expect(stage.step).toBe(1);
    expect(stage.cta.href).toBe("/onboarding");
  });

  it("treats a profile with no target role as no profile", () => {
    // The dashboard used to paper over this by falling back to roles[0], which
    // showed a brand-new learner someone else's plan.
    expect(currentStage({ profile: { targetRoleId: "" }, events: [], evidence: [] }).id).toBe("goal");
  });

  it("asks for the diagnostic once a goal exists", () => {
    const stage = currentStage({ profile, events: [], evidence: [] });

    expect(stage.id).toBe("level");
    expect(stage.step).toBe(2);
    expect(stage.cta.href).toBe("/diagnostic");
  });

  it("does not count a completion as a diagnostic", () => {
    // Completing a resource without ever taking the diagnostic must not skip
    // step 2 — the roadmap would still be built on assumed-zero mastery.
    expect(currentStage({ profile, events: [quiz], evidence: [] }).id).toBe("level");
  });

  it("asks for a first completed step once the level is known", () => {
    const stage = currentStage({ profile, events: [diagnostic], evidence: [] });

    expect(stage.id).toBe("learn");
    expect(stage.step).toBe(3);
  });

  it("counts labs and reviewed projects as completions too", () => {
    for (const verb of ["quiz_completed", "lab_completed", "project_reviewed"] as const) {
      const stage = currentStage({ profile, events: [diagnostic, { verb }], evidence: [] });
      expect(stage.id).toBe("prove");
    }
  });

  it("ignores feedback events, which are not work", () => {
    const stage = currentStage({
      profile,
      events: [diagnostic, { verb: "feedback_submitted" }],
      evidence: []
    });

    expect(stage.id).toBe("learn");
  });

  it("asks for proof once something has been completed", () => {
    const stage = currentStage({ profile, events: [diagnostic, quiz], evidence: [] });

    expect(stage.id).toBe("prove");
    expect(stage.step).toBe(TOTAL_STEPS);
    expect(stage.complete).toBe(false);
  });

  it("is underway once evidence exists", () => {
    const stage = currentStage({ profile, events: [diagnostic, quiz], evidence });

    expect(stage.id).toBe("underway");
    expect(stage.complete).toBe(true);
  });

  it("always offers a next action", () => {
    const cases = [
      { profile: null, events: [], evidence: [] },
      { profile, events: [], evidence: [] },
      { profile, events: [diagnostic], evidence: [] },
      { profile, events: [diagnostic, quiz], evidence: [] },
      { profile, events: [diagnostic, quiz], evidence }
    ];

    for (const input of cases) {
      const stage = currentStage(input);
      expect(stage.cta.label.length).toBeGreaterThan(0);
      expect(stage.cta.href.startsWith("/")).toBe(true);
      expect(stage.why.length).toBeGreaterThan(0);
    }
  });
});
