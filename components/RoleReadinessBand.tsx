import { STATUS_TONE } from "@/lib/ui";

type PerSkill = {
  skillId: string;
  skillName: string;
  mastery: number;
  importance: number;
  status: "mastered" | "partial" | "missing";
};

/**
 * Where you stand against your own target role, before any job posting is
 * involved.
 *
 * This used to be a separate page ("Am I ready?") that asked the learner to
 * paste a job description, parsed it with a model call, then threw the result
 * away and rendered this number — which does not depend on the posting at all.
 * A job title above a score that ignores the job is worse than no page. The
 * number is honest; the input was the lie, so the input is gone.
 */
export function RoleReadinessBand({
  overall,
  perSkill,
  roleTitle
}: {
  overall: number;
  perSkill: PerSkill[];
  roleTitle: string;
}) {
  const counts = {
    mastered: perSkill.filter((s) => s.status === "mastered").length,
    partial: perSkill.filter((s) => s.status === "partial").length,
    missing: perSkill.filter((s) => s.status === "missing").length
  };

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Against your target role</h2>
          <p className="mt-1 text-sm text-muted">
            {roleTitle} · {counts.mastered} mastered · {counts.partial} partial · {counts.missing} not
            started
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl font-semibold tabular-nums text-ink">
            {Math.round(overall * 100)}%
          </p>
          <p className="text-xs text-muted">weighted by importance</p>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {perSkill.map((skill) => (
          <div
            className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2"
            key={skill.skillId}
          >
            <span className="min-w-0 truncate text-sm text-ink">{skill.skillName}</span>
            <span
              className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ${STATUS_TONE[skill.status]}`}
            >
              {Math.round(skill.mastery * 100)}%
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs leading-5 text-muted">
        This is your standing baseline. Paste a posting below to see how one specific job compares
        against it.
      </p>
    </section>
  );
}
