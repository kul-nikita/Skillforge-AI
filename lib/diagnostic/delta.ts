import type { MasteryMap } from "@/lib/types";

/**
 * What a repeat diagnostic actually told the learner.
 *
 * Running one twice used to produce a screen indistinguishable from the first
 * run, which made the second run look pointless even though the event log had
 * recorded every bit of it. Mastery is derived from an append-only log, so the
 * difference between "before this run" and "after it" is just arithmetic.
 */

export type SkillMovement = {
  skillId: string;
  /** Null when this skill had never been assessed before. */
  before: number | null;
  after: number;
  change: number;
};

export type DiagnosticDelta = {
  firstRun: boolean;
  improved: SkillMovement[];
  declined: SkillMovement[];
  /** Assessed again and landed on the same estimate. */
  unchangedCount: number;
  /** Assessed for the first time in this run. */
  newlyAssessed: SkillMovement[];
};

/** Below this, a change is ladder noise rather than a result worth announcing. */
const SIGNIFICANT = 0.001;

export function summariseDelta(previous: MasteryMap, current: MasteryMap): DiagnosticDelta {
  const firstRun = Object.keys(previous).length === 0;
  const improved: SkillMovement[] = [];
  const declined: SkillMovement[] = [];
  const newlyAssessed: SkillMovement[] = [];
  let unchangedCount = 0;

  for (const [skillId, after] of Object.entries(current)) {
    const before = skillId in previous ? previous[skillId] : null;

    if (before === null) {
      newlyAssessed.push({ skillId, before: null, after, change: after });
      continue;
    }

    const change = after - before;
    const movement: SkillMovement = { skillId, before, after, change };

    if (change > SIGNIFICANT) {
      improved.push(movement);
    } else if (change < -SIGNIFICANT) {
      declined.push(movement);
    } else {
      unchangedCount += 1;
    }
  }

  // Biggest movement first in both directions: that is the one worth reading.
  improved.sort((a, b) => b.change - a.change);
  declined.sort((a, b) => a.change - b.change);
  newlyAssessed.sort((a, b) => b.after - a.after);

  return { firstRun, improved, declined, unchangedCount, newlyAssessed };
}
