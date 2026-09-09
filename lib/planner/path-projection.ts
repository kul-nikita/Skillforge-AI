import type { MasteryMap, Role } from "@/lib/types";

/**
 * The mastery a learner would hold if they finished the roadmap we recommend.
 *
 * Used to answer "if I follow your path, how ready am I for THIS job?" — which
 * only means something if it is allowed to fall short. The path covers the
 * target role's required skills and nothing else, so a posting asking for
 * Python and PowerShell when the role does not teach them must still show those
 * as open afterwards. Projecting every requirement to mastered would turn the
 * comparison into an advert.
 */

/** What the roadmap drives a skill to — the same threshold the planner counts as mastered. */
export const PATH_TARGET_MASTERY = 0.8;

export function projectMasteryAfterPath(
  mastery: MasteryMap,
  role: Role,
  target = PATH_TARGET_MASTERY
): MasteryMap {
  const projected: MasteryMap = { ...mastery };

  for (const { skillId } of role.requiredSkills) {
    // Never move a skill down: a learner already past the target keeps what the
    // evidence says they have.
    projected[skillId] = Math.max(projected[skillId] ?? 0, target);
  }

  return projected;
}

/**
 * Requirements the recommended path will not close, because the target role
 * does not ask for them. Naming them is the point of the comparison.
 */
export function requirementsPathWontCover(
  matched: Array<{ graphSkill: { id: string; name: string }; isRequired: boolean }>,
  role: Role
): string[] {
  const inPath = new Set(role.requiredSkills.map((rs) => rs.skillId));

  return matched
    .filter((item) => !inPath.has(item.graphSkill.id))
    .map((item) => item.graphSkill.name);
}
