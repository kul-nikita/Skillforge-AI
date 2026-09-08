import type { Gap, Skill } from "@/lib/types";

/**
 * A milestone is a layer of the prerequisite graph, not an arbitrary chunk of
 * the list.
 *
 * Everything in milestone 1 can be started today; nothing in milestone 2 can
 * begin until the layer beneath it is cleared. That makes the grouping a
 * property of the graph rather than a presentational decision, so it cannot
 * drift from the order the planner actually enforces.
 */
export type Milestone = {
  /** 1-based, in the order they must be cleared. */
  index: number;
  title: string;
  skills: Gap[];
  /** Skills already at target mastery, shown so a milestone can read as done. */
  clearedSkills: Gap[];
  complete: boolean;
  /** The first milestone that still has work in it. */
  current: boolean;
};

const MASTERY_TARGET = 0.8;

/** "Log Analysis", "Log Analysis and SIEM Querying", "Log Analysis and 3 more". */
function titleFor(skills: Gap[]): string {
  const names = skills.map((gap) => gap.skill.name);

  if (names.length === 0) return "Complete";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;

  return `${names[0]} and ${names.length - 1} more`;
}

/**
 * Layers the role's skills by prerequisite depth. A skill sits one layer below
 * whichever of its prerequisites is deepest; skills whose prerequisites are all
 * outside the role (or already met) form the first layer.
 */
export function buildMilestones(gaps: Gap[], mastered: Gap[]): Milestone[] {
  const all = [...gaps, ...mastered];

  if (all.length === 0) {
    return [];
  }

  const inRole = new Set(all.map((item) => item.skill.id));
  const depth = new Map<string, number>();

  const depthOf = (skill: Skill, seen: Set<string>): number => {
    const cached = depth.get(skill.id);
    if (cached !== undefined) return cached;

    // A cycle would already have thrown in topologicalGapOrder; guard anyway so
    // a bad seed degrades to a flat layer instead of a stack overflow.
    if (seen.has(skill.id)) return 0;
    seen.add(skill.id);

    const parents = skill.prerequisites.filter((id) => inRole.has(id));
    const value =
      parents.length === 0
        ? 0
        : 1 +
          Math.max(
            ...parents.map((id) => {
              const parent = all.find((item) => item.skill.id === id)!;
              return depthOf(parent.skill, seen);
            })
          );

    depth.set(skill.id, value);
    return value;
  };

  for (const item of all) {
    depthOf(item.skill, new Set());
  }

  const layers = new Map<number, { gaps: Gap[]; cleared: Gap[] }>();
  for (const item of all) {
    const level = depth.get(item.skill.id) ?? 0;
    const layer = layers.get(level) ?? { gaps: [], cleared: [] };
    (item.currentMastery >= MASTERY_TARGET ? layer.cleared : layer.gaps).push(item);
    layers.set(level, layer);
  }

  const ordered = [...layers.entries()].sort(([a], [b]) => a - b);
  let currentSeen = false;

  return ordered.map(([, layer], position) => {
    const skills = [...layer.gaps].sort(
      (a, b) => b.importance - a.importance || a.skill.name.localeCompare(b.skill.name)
    );
    const complete = skills.length === 0;
    const current = !complete && !currentSeen;

    if (current) {
      currentSeen = true;
    }

    return {
      index: position + 1,
      title: titleFor(skills.length > 0 ? skills : layer.cleared),
      skills,
      clearedSkills: layer.cleared,
      complete,
      current
    };
  });
}
