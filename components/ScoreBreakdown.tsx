import type { ScoreBreakdown as ScoreBreakdownType } from "@/lib/types";

const LABELS: Array<[keyof Omit<ScoreBreakdownType, "total">, string]> = [
  ["gapMatch", "Gap match"],
  ["prereqReadiness", "Prerequisite readiness"],
  ["quality", "Quality"],
  ["preferenceFit", "Preference fit"],
  ["timeFit", "Time fit"],
  ["costFit", "Cost fit"]
];

export function ScoreBreakdown({ score }: { score: ScoreBreakdownType }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {LABELS.map(([key, label]) => (
        <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2" key={key}>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
          <dd className="mt-0.5 text-base font-semibold text-ink">{Math.round(score[key] * 100)}%</dd>
        </div>
      ))}
    </dl>
  );
}
