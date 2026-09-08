import type { MasteryMap } from "@/lib/types";

export type LearningEvent = {
  learnerId: string;
  verb: "diagnostic_answered" | "quiz_completed" | "lab_completed" | "project_reviewed" | "feedback_submitted";
  objectType: "skill" | "resource" | "evidence";
  objectId: string;
  skillId: string;
  score?: number;
  durationMinutes?: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
};

const EVENT_WEIGHTS: Record<LearningEvent["verb"], number> = {
  diagnostic_answered: 0.2,
  quiz_completed: 0.25,
  lab_completed: 0.3,
  project_reviewed: 0.4,
  feedback_submitted: 0.05
};

export function deriveMasteryFromEvents(events: LearningEvent[]): MasteryMap {
  const grouped = new Map<string, Array<{ score: number; weight: number }>>();

  for (const event of events) {
    if (typeof event.score !== "number") {
      continue;
    }

    const entries = grouped.get(event.skillId) ?? [];
    entries.push({
      score: clamp(event.score),
      weight: EVENT_WEIGHTS[event.verb]
    });
    grouped.set(event.skillId, entries);
  }

  return Object.fromEntries(
    [...grouped.entries()].map(([skillId, entries]) => {
      const totalWeight = entries.reduce((sum, item) => sum + item.weight, 0);
      const mastery = entries.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight;
      return [skillId, clamp(mastery)];
    })
  );
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
