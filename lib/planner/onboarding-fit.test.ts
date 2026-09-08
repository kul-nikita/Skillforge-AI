import { describe, expect, it } from "vitest";
import { describeFit } from "./onboarding-fit";

describe("describeFit", () => {
  it("multiplies the learner's own budget rather than guessing at one", () => {
    const fit = describeFit({ requiredSkillCount: 10, timelineWeeks: 21, weeklyHours: 4 });

    expect(fit.totalHours).toBe(84);
    expect(fit.hoursPerSkill).toBe(8.4);
    expect(fit.verdict).toBe("comfortable");
  });

  it("calls a brisk pace tight without telling the learner they can't do it", () => {
    const fit = describeFit({ requiredSkillCount: 12, timelineWeeks: 8, weeklyHours: 3 });

    expect(fit.verdict).toBe("tight");
    // Product rule 6: describe the pace and the knobs, never the person.
    expect(fit.note).toMatch(/adding weeks or hours/i);
    expect(fit.note).not.toMatch(/can't|cannot|not enough|unrealistic|impossible/i);
  });

  it("sits on the boundaries where the thresholds say it should", () => {
    // Exactly 8h/skill is comfortable; a hair under is workable.
    expect(describeFit({ requiredSkillCount: 10, timelineWeeks: 10, weeklyHours: 8 }).verdict).toBe(
      "comfortable"
    );
    expect(describeFit({ requiredSkillCount: 10, timelineWeeks: 10, weeklyHours: 7 }).verdict).toBe(
      "workable"
    );
    // Exactly 4h/skill is still workable; below it is tight.
    expect(describeFit({ requiredSkillCount: 10, timelineWeeks: 10, weeklyHours: 4 }).verdict).toBe(
      "workable"
    );
    expect(describeFit({ requiredSkillCount: 10, timelineWeeks: 10, weeklyHours: 3 }).verdict).toBe(
      "tight"
    );
  });

  it("does not divide by zero when a role has no seeded skills", () => {
    const fit = describeFit({ requiredSkillCount: 0, timelineWeeks: 12, weeklyHours: 5 });

    expect(fit.hoursPerSkill).toBe(0);
    expect(fit.totalHours).toBe(60);
    expect(fit.note).not.toMatch(/NaN|Infinity/);
  });

  it("rounds instead of rendering a repeating decimal at the learner", () => {
    const fit = describeFit({ requiredSkillCount: 3, timelineWeeks: 5, weeklyHours: 2.5 });

    expect(fit.totalHours).toBe(12.5);
    expect(fit.hoursPerSkill).toBe(4.2);
    expect(fit.note).toContain("4.2");
  });
});
