/**
 * How a learner's stated budget compares to the size of the role they picked.
 *
 * Deliberately arithmetic over what the client already has — `listRoles()`
 * returns `requiredSkills`, so the review screen can recompute this on every
 * keystroke without a round-trip. It does NOT sum catalog durations: that needs
 * a per-skill query, and "about 8 hours per skill" from real numbers is worth
 * more than a total-hours figure that looks precise and isn't.
 *
 * Product rule 6: the note never says the learner cannot do something. A thin
 * budget is described as thin, with the two knobs that would widen it.
 */

export type FitVerdict = "comfortable" | "workable" | "tight";

export type Fit = {
  /** The learner's own budget: weeks x hours. */
  totalHours: number;
  hoursPerSkill: number;
  verdict: FitVerdict;
  note: string;
};

/**
 * Hours per skill. A skill typically means one substantial resource plus the
 * post-check, so under ~4h there is no room for practice, and ~8h is space to
 * do a resource properly and still fail one and retry.
 */
const COMFORTABLE_HOURS_PER_SKILL = 8;
const WORKABLE_HOURS_PER_SKILL = 4;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function describeFit({
  requiredSkillCount,
  timelineWeeks,
  weeklyHours
}: {
  requiredSkillCount: number;
  timelineWeeks: number;
  weeklyHours: number;
}): Fit {
  const totalHours = round(timelineWeeks * weeklyHours);

  // A role with no seeded skills is a data problem, not a learner problem —
  // say nothing rather than divide by zero.
  if (requiredSkillCount <= 0) {
    return {
      totalHours,
      hoursPerSkill: 0,
      verdict: "workable",
      note: `${totalHours} hours in total.`
    };
  }

  const hoursPerSkill = round(totalHours / requiredSkillCount);

  if (hoursPerSkill >= COMFORTABLE_HOURS_PER_SKILL) {
    return {
      totalHours,
      hoursPerSkill,
      verdict: "comfortable",
      note: `About ${hoursPerSkill} hours per skill — room to go deep and to retry anything that doesn't stick.`
    };
  }

  if (hoursPerSkill >= WORKABLE_HOURS_PER_SKILL) {
    return {
      totalHours,
      hoursPerSkill,
      verdict: "workable",
      note: `About ${hoursPerSkill} hours per skill — roughly one solid resource each.`
    };
  }

  return {
    totalHours,
    hoursPerSkill,
    verdict: "tight",
    note: `About ${hoursPerSkill} hours per skill, which is a brisk pace. Adding weeks or hours would leave room to practice — you can also change this later.`
  };
}
