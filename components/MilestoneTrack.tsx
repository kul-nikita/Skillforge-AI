import { Check, Lock } from "lucide-react";
import { card } from "@/lib/ui";
import type { Milestone } from "@/lib/planner/milestones";

/**
 * The roadmap as milestones rather than a flat queue of skills.
 *
 * Each one is a layer of the prerequisite graph: everything inside a milestone
 * can be worked in any order, and nothing in the next can start until this one
 * clears. The word "milestone" appeared in the marketing copy long before there
 * was anything behind it; this is the thing itself.
 */
export function MilestoneTrack({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) {
    return null;
  }

  const cleared = milestones.filter((milestone) => milestone.complete).length;

  return (
    <section className={`${card} p-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight text-ink">Milestones</h2>
        <p className="text-sm text-muted tabular-nums">
          {cleared} of {milestones.length} cleared
        </p>
      </div>

      <ol className="mt-4 space-y-3">
        {milestones.map((milestone) => {
          const locked = !milestone.complete && !milestone.current;
          const total = milestone.skills.length + milestone.clearedSkills.length;

          return (
            <li
              className={`flex gap-3 rounded-md border p-3 ${
                milestone.current
                  ? "border-cyan-300/40 bg-cyan-300/5"
                  : "border-border bg-surface-sunken"
              }`}
              key={milestone.index}
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular-nums ${
                  milestone.complete
                    ? "border-cyan-300/50 text-cyan-300"
                    : milestone.current
                      ? "border-ink text-ink"
                      : "border-border text-muted"
                }`}
              >
                {milestone.complete ? <Check size={13} /> : locked ? <Lock size={11} /> : milestone.index}
              </span>

              <div className="min-w-0">
                <p
                  className={`text-sm font-medium ${milestone.complete || locked ? "text-muted" : "text-ink"}`}
                >
                  {milestone.title}
                </p>

                <p className="mt-0.5 text-xs text-muted">
                  {milestone.complete
                    ? `All ${total} skill${total === 1 ? "" : "s"} cleared`
                    : milestone.current
                      ? `${milestone.skills.length} of ${total} left — you can start any of these now`
                      : `Unlocks once milestone ${milestone.index - 1} is cleared`}
                </p>

                {!milestone.complete && (
                  <p className="mt-1.5 text-xs leading-5 text-muted">
                    {milestone.skills.map((item) => item.skill.name).join(" · ")}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
