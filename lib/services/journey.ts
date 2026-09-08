import type { LearningEvent } from "@/lib/adaptation/mastery";
import type { Evidence, LearnerProfile } from "@/lib/types";

/**
 * Where a learner is in the loop the product actually promises: state a goal,
 * measure where you are, do the next thing, prove it.
 *
 * Derived from what the learner has actually done, never stored — the same
 * reason mastery is derived from the event log. A stage that can go stale is a
 * stage that will eventually lie about what to do next.
 */
export type StageId = "goal" | "level" | "learn" | "prove" | "underway";

export type JourneyStage = {
  id: StageId;
  /** 1-based, for "step 2 of 4". `underway` reports the last step as complete. */
  step: number;
  total: number;
  title: string;
  /** Why this step matters, in the learner's terms — not the system's. */
  why: string;
  cta: { label: string; href: string };
  complete: boolean;
};

export const TOTAL_STEPS = 4;

const COMPLETION_VERBS: ReadonlySet<LearningEvent["verb"]> = new Set([
  "quiz_completed",
  "lab_completed",
  "project_reviewed"
]);

export function currentStage({
  profile,
  events,
  evidence
}: {
  profile: Pick<LearnerProfile, "targetRoleId"> | null;
  events: Pick<LearningEvent, "verb">[];
  evidence: Pick<Evidence, "id">[];
}): JourneyStage {
  if (!profile?.targetRoleId) {
    return {
      id: "goal",
      step: 1,
      total: TOTAL_STEPS,
      title: "Tell us what you're aiming at",
      why: "Everything else is built from your goal — the roadmap, what counts as a gap, what to learn first.",
      cta: { label: "Set your goal", href: "/onboarding" },
      complete: false
    };
  }

  if (!events.some((event) => event.verb === "diagnostic_answered")) {
    return {
      id: "level",
      step: 2,
      total: TOTAL_STEPS,
      title: "Find out where you actually are",
      why: "A short adaptive check replaces guesswork with a real starting point. Until you take it, your roadmap assumes you know nothing.",
      cta: { label: "Take the diagnostic", href: "/diagnostic" },
      complete: false
    };
  }

  if (!events.some((event) => COMPLETION_VERBS.has(event.verb))) {
    return {
      id: "learn",
      step: 3,
      total: TOTAL_STEPS,
      title: "Do the first thing on your path",
      why: "Your first step is picked to be the one you're ready for — not the hardest, not the most popular.",
      cta: { label: "See your next step", href: "/dashboard" },
      complete: false
    };
  }

  if (evidence.length === 0) {
    return {
      id: "prove",
      step: 4,
      total: TOTAL_STEPS,
      title: "Turn that into proof",
      why: "Finishing something moves your mastery. Passing the check on it produces a signed record you can show someone.",
      cta: { label: "Prove a skill", href: "/dashboard" },
      complete: false
    };
  }

  return {
    id: "underway",
    step: TOTAL_STEPS,
    total: TOTAL_STEPS,
    title: "You're underway",
    why: "Keep closing gaps in order. Each one you prove unlocks what depends on it.",
    cta: { label: "Continue your path", href: "/dashboard" },
    complete: true
  };
}
