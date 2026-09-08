import type { LearningEvent } from "@/lib/adaptation/mastery";
import { questionBank, type DiagnosticQuestion } from "@/lib/diagnostic/questions";
import type { MasteryMap, Role } from "@/lib/types";

export type DiagnosticAnswer = {
  questionId: string;
  correct: boolean;
};

/** What the client sends: the option it picked, never whether it was right. */
export type SubmittedAnswer = {
  questionId: string;
  selectedIndex: number;
};

/** Server-side, so the answer key never reaches the browser. Unknown ids grade as wrong. */
export function gradeAnswers(submitted: SubmittedAnswer[]): DiagnosticAnswer[] {
  return submitted.map(({ questionId, selectedIndex }) => {
    const question = questionBank.find((candidate) => candidate.id === questionId);
    return { questionId, correct: question ? question.correctIndex === selectedIndex : false };
  });
}

/** Mastery estimate for each path through the two-question ladder. */
const LADDER_ESTIMATE = {
  advancedCorrect: 0.9,
  intermediateOnly: 0.7,
  beginnerOnly: 0.4,
  none: 0.1
};

export const MAX_QUESTIONS = 15;

/**
 * Adaptive ladder, at most two questions per skill:
 *   intermediate correct → advanced   (0.9 if right, 0.7 if wrong)
 *   intermediate wrong   → beginner   (0.4 if right, 0.1 if wrong)
 * Skills are visited in role-importance order so a truncated run still
 * covers what matters most for the target role.
 */
export function selectNextQuestion(role: Role, answers: DiagnosticAnswer[]): DiagnosticQuestion | null {
  if (answers.length >= MAX_QUESTIONS) {
    return null;
  }

  const answered = new Map(answers.map((answer) => [answer.questionId, answer.correct]));
  const skillOrder = [...role.requiredSkills].sort((a, b) => b.importance - a.importance);

  for (const { skillId } of skillOrder) {
    const intermediate = findQuestion(skillId, "intermediate");
    if (!intermediate) {
      continue;
    }

    if (!answered.has(intermediate.id)) {
      return intermediate;
    }

    const followUp = findQuestion(skillId, answered.get(intermediate.id) ? "advanced" : "beginner");
    if (followUp && !answered.has(followUp.id)) {
      return followUp;
    }
  }

  return null;
}

export function estimateMastery(answers: DiagnosticAnswer[]): MasteryMap {
  const answered = new Map(answers.map((answer) => [answer.questionId, answer.correct]));
  const estimates: MasteryMap = {};

  for (const skillId of new Set(questionBank.map((question) => question.skillId))) {
    const intermediate = findQuestion(skillId, "intermediate");
    if (!intermediate || !answered.has(intermediate.id)) {
      continue;
    }

    if (answered.get(intermediate.id)) {
      const advanced = findQuestion(skillId, "advanced");
      const advancedCorrect = advanced ? answered.get(advanced.id) : undefined;
      estimates[skillId] =
        advancedCorrect === undefined
          ? LADDER_ESTIMATE.intermediateOnly
          : advancedCorrect
            ? LADDER_ESTIMATE.advancedCorrect
            : LADDER_ESTIMATE.intermediateOnly;
      continue;
    }

    const beginner = findQuestion(skillId, "beginner");
    const beginnerCorrect = beginner ? answered.get(beginner.id) : undefined;
    estimates[skillId] =
      beginnerCorrect === undefined
        ? LADDER_ESTIMATE.none
        : beginnerCorrect
          ? LADDER_ESTIMATE.beginnerOnly
          : LADDER_ESTIMATE.none;
  }

  return estimates;
}

/** One event per skill, so mastery is still derived from the log rather than written. */
export function diagnosticEvents(learnerId: string, estimates: MasteryMap, timestamp: string): LearningEvent[] {
  return Object.entries(estimates).map(([skillId, score]) => ({
    learnerId,
    verb: "diagnostic_answered",
    objectType: "skill",
    objectId: skillId,
    skillId,
    score,
    timestamp
  }));
}

function findQuestion(skillId: string, difficulty: DiagnosticQuestion["difficulty"]) {
  return questionBank.find((question) => question.skillId === skillId && question.difficulty === difficulty);
}
