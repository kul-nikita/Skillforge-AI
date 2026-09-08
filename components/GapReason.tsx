import type { Blocker } from "@/lib/types";

/**
 * Why a skill is where it is in the order, and what that says about the learner.
 *
 * The planner used to hand the UI one sentence — "Build prerequisite evidence
 * first: Networking Fundamentals." — which names a blocker and stops. It does
 * not say how close the learner is to clearing it, or what clearing it would
 * open up, so the ordering reads as arbitrary. All three facts come from the
 * same graph traversal the prerequisite gate uses; only the last two were being
 * thrown away.
 */
export function GapReason({
  blockedBy,
  currentMastery,
  reason,
  skillName,
  unlocks
}: {
  blockedBy: Blocker[];
  currentMastery: number;
  reason: string;
  skillName: string;
  unlocks: string[];
}) {
  if (blockedBy.length === 0) {
    return (
      <div className="mt-2 space-y-1.5">
        <p className="text-xs leading-5 text-emerald-200">
          Ready to start — every prerequisite for {skillName} is already evidenced.
          {currentMastery > 0 && (
            <> You are at {Math.round(currentMastery * 100)}% against this role&apos;s target.</>
          )}
        </p>
        {unlocks.length > 0 && (
          <p className="text-xs leading-5 text-muted">Opens up: {unlocks.join(", ")}.</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-xs leading-5 text-muted">{reason}</p>
      <ul className="space-y-1">
        {blockedBy.map((blocker) => (
          <li className="flex items-center gap-2 text-xs leading-5" key={blocker.skillId}>
            <span className="text-muted">{blocker.name}</span>
            {/* The number is the point: "you are at 30%" and "you are at 0%" are
                the difference between nearly there and not started. */}
            <span className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-white/10">
              <span
                className="block h-full rounded-full bg-amber-300/70"
                style={{ width: `${Math.max(Math.round(blocker.mastery * 100), 2)}%` }}
              />
            </span>
            <span className="tabular-nums text-amber-200">
              {Math.round(blocker.mastery * 100)}%
            </span>
            <span className="text-slate-600">/ needs 60%</span>
          </li>
        ))}
      </ul>
      {unlocks.length > 0 && (
        <p className="text-xs leading-5 text-muted">
          Clearing {skillName} opens up: {unlocks.join(", ")}.
        </p>
      )}
    </div>
  );
}
