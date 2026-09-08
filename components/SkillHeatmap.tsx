import { Grid3X3, Lock } from "lucide-react";
import type { Gap, MasteryMap } from "@/lib/types";

const PREREQUISITE_THRESHOLD = 0.6;
const MASTERY_THRESHOLD = 0.8;

/**
 * Deliberately CSS rather than a chart library: this is a grid of coloured
 * cells, and Recharts would ship a renderer to do what `grid` already does.
 *
 * Mastery drives the fill, but never carries meaning on its own. Every tile
 * also states the percentage in text, so the heatmap is readable without
 * colour vision.
 */
export function SkillHeatmap({
  gaps,
  mastered,
  mastery
}: {
  gaps: Gap[];
  mastered: Gap[];
  mastery: MasteryMap;
}) {
  // `gaps` is in prerequisite order and `mastered` is everything already
  // cleared, so together they are exactly the role's required skills.
  const tiles = [...mastered, ...gaps].map((item) => {
    const unmet = item.skill.prerequisites.filter(
      (id) => (mastery[id] ?? 0) < PREREQUISITE_THRESHOLD
    );
    return { ...item, locked: unmet.length > 0 && item.currentMastery < MASTERY_THRESHOLD, unmet };
  });

  if (tiles.length === 0) {
    return null;
  }

  return (
    <article className="rounded-lg border border-white/10 bg-surface/95 p-5 shadow-card">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-emerald-200">
          <Grid3X3 aria-hidden="true" size={20} />
          <h2 className="text-lg font-semibold text-white">Skill heatmap</h2>
        </div>
        <span className="rounded-md border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-xs font-semibold text-emerald-100">
          {tiles.length} skills
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted">
        Every skill this role requires, shaded by current mastery. Locked skills are waiting on a
        prerequisite, not on you.
      </p>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {tiles.map((tile) => {
          const percent = Math.round(tile.currentMastery * 100);
          return (
            <li
              className="min-h-[112px] rounded-md border border-white/10 p-3 shadow-inner-hairline"
              // Alpha carries the intensity so the accent stays on-brand at every
              // level; the floor keeps a 0% tile visible rather than blank.
              style={{ backgroundColor: `rgba(34, 211, 238, ${0.05 + tile.currentMastery * 0.30})` }}
              key={tile.skill.id}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{tile.skill.name}</span>
                {tile.locked && (
                  <Lock
                    aria-label="Prerequisites not met"
                    className="shrink-0 text-violet-200"
                    size={14}
                  />
                )}
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-cyan-200" style={{ width: `${percent}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>{percent}% mastery</span>
                <span className="h-1 w-1 rounded-full bg-slate-600" />
                <span>{Math.round(tile.importance * 100)}% importance</span>
              </div>
              {tile.locked && (
                <div className="mt-2 rounded-md bg-violet-300/10 px-2 py-1 text-xs text-violet-100">
                  needs {tile.unmet.length} prerequisite{tile.unmet.length === 1 ? "" : "s"}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex items-center gap-3 text-xs text-muted">
        <span>0%</span>
        <span
          aria-hidden="true"
          className="h-2 flex-1 rounded-full"
          style={{
            backgroundImage: "linear-gradient(to right, rgba(34,211,238,0.05), rgba(34,211,238,0.35))"
          }}
        />
        <span>100%</span>
      </div>
    </article>
  );
}
