import { Check, Lock } from "lucide-react";
import type { Skill } from "@/lib/types";

/**
 * A real prerequisite chain, drawn. The skills come from the seeded graph rather
 * than a hardcoded illustration, so it cannot drift from what the planner does.
 */
export function PrerequisiteChain({ chain }: { chain: Skill[] }) {
  if (chain.length === 0) {
    return null;
  }

  return (
    <figure className="rounded-xl border border-border bg-surface p-5 shadow-lift">
      <figcaption className="text-xs font-semibold uppercase tracking-wide text-muted">
        How sequencing works
      </figcaption>

      <ol className="mt-4 space-y-0">
        {chain.map((skill, index) => {
          // Everything before the last node reads as met, so the diagram shows
          // the moment that matters: the next skill is reachable because its
          // dependencies are done.
          const locked = index === chain.length - 1;

          return (
            <li key={skill.id}>
              <div
                className={`flex items-start gap-3 rounded-lg border p-3 ${
                  locked ? "border-dashed border-border-strong bg-surface-sunken" : "border-border bg-surface"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                    locked ? "bg-border-strong text-white" : "bg-teal text-white"
                  }`}
                >
                  {locked ? <Lock size={12} /> : <Check size={13} />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{skill.name}</p>
                  <p className="text-xs text-muted">
                    {locked ? "Locked until the step above is met" : "Mastery on record"}
                  </p>
                </div>
              </div>

              {index < chain.length - 1 ? (
                <div aria-hidden="true" className="ml-6 flex h-5 items-center">
                  <span className="h-full w-px bg-border-strong" />
                  <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                    unlocks
                  </span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted">
        Enforced as a Cypher traversal in Neo4j, not a model&apos;s judgement — a locked skill cannot
        be recommended, whatever the ranking says.
      </p>
    </figure>
  );
}

/**
 * Longest prerequisite path we can find, capped at three nodes — long enough to
 * show a dependency actually chaining, short enough to read at a glance.
 */
export function pickChain(skills: Skill[], max = 3): Skill[] {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  let best: Skill[] = [];

  for (const skill of skills) {
    const chain: Skill[] = [skill];
    let cursor = skill;

    while (chain.length < max) {
      const parent = cursor.prerequisites.map((id) => byId.get(id)).find(Boolean);
      if (!parent) {
        break;
      }
      chain.unshift(parent);
      cursor = parent;
    }

    if (chain.length > best.length) {
      best = chain;
    }
    if (best.length === max) {
      break;
    }
  }

  return best;
}
