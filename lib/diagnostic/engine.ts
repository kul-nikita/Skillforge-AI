import type { LearningEvent } from "@/lib/adaptation/mastery";
import { questionBank } from "@/lib/diagnostic/questions";
import { readToken } from "@/lib/crypto/signing";
import type { Difficulty, MasteryMap, Role } from "@/lib/types";

/**
 * An answer describes itself. It used to carry only a question id, so every
 * downstream step had to look the question up in the bank — which made a
 * model-written question ungradeable and unscoreable. Skill and difficulty
 * travel with the answer instead, and the bank becomes one source of questions
 * rather than the only one.
 */
export type DiagnosticAnswer = {
  questionId: string;
  skillId: string;
  difficulty: Difficulty;
  correct: boolean;
};

/** What the client sends: the option it picked, never whether it was right. */
export type SubmittedAnswer = {
  questionId: string;
  selectedIndex: number;
  /**
   * For a generated question, the server's own signed record of what it issued
   * — skill, difficulty and the correct option. The route is stateless, so this
   * is how the answer key survives the round trip without ever being sent to
   * the browser in readable form.
   */
  token?: string;
};

type IssuedQuestion = {
  learnerId: string;
  questionId: string;
  skillId: string;
  difficulty: Difficulty;
  correctIndex: number;
};

/** Null unless the token is intact, unexpired, and this learner's. */
function readIssued(token: string | undefined, learnerId: string | null): IssuedQuestion | null {
  // A null learner means the caller issues no tokens (the completion post-check
  // draws only from the bank), so a token supplied anyway is not honoured.
  if (!token || !learnerId) return null;

  const claims = readToken(token);

  if (!claims || claims.learnerId !== learnerId) {
    return null;
  }

  const { questionId, skillId, difficulty, correctIndex } = claims;

  if (
    typeof questionId !== "string" ||
    typeof skillId !== "string" ||
    typeof difficulty !== "string" ||
    typeof correctIndex !== "number"
  ) {
    return null;
  }

  return {
    learnerId,
    questionId,
    skillId,
    difficulty: difficulty as Difficulty,
    correctIndex
  };
}

/** Server-side, so the answer key never reaches the browser. Unknown ids grade as wrong. */
export function gradeAnswers(
  submitted: SubmittedAnswer[],
  learnerId: string | null
): DiagnosticAnswer[] {
  return submitted.flatMap(({ questionId, selectedIndex, token }) => {
    const issued = readIssued(token, learnerId);

    if (issued) {
      // A token for a different question is a tampered submission, not an
      // answer to grade — drop it rather than scoring it against the wrong key.
      if (issued.questionId !== questionId) {
        return [];
      }

      return [{
        questionId,
        skillId: issued.skillId,
        difficulty: issued.difficulty,
        correct: issued.correctIndex === selectedIndex
      }];
    }

    const question = questionBank.find((candidate) => candidate.id === questionId);

    if (!question) {
      return [];
    }

    return [{
      questionId,
      skillId: question.skillId,
      difficulty: question.difficulty,
      correct: question.correctIndex === selectedIndex
    }];
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
 *
 * This returns what to ask, not the question itself. Choosing the skill and the
 * level stays here, in code, whoever ends up writing the words — product rule 2
 * keeps sequencing out of the model's hands.
 */
export type QuestionTarget = { skillId: string; difficulty: Difficulty };

/** Every remaining target in priority order, so a caller that cannot produce
 * one question (a model failure with no bank row to fall back to) can move to
 * the next instead of ending the diagnostic early. */
export function remainingTargets(role: Role, answers: DiagnosticAnswer[]): QuestionTarget[] {
  if (answers.length >= MAX_QUESTIONS) {
    return [];
  }

  const targets: QuestionTarget[] = [];
  const skillOrder = [...role.requiredSkills].sort((a, b) => b.importance - a.importance);

  for (const { skillId } of skillOrder) {
    const forSkill = answers.filter((answer) => answer.skillId === skillId);
    const intermediate = forSkill.find((answer) => answer.difficulty === "intermediate");

    if (!intermediate) {
      targets.push({ skillId, difficulty: "intermediate" });
      continue;
    }

    const followUp: Difficulty = intermediate.correct ? "advanced" : "beginner";

    if (!forSkill.some((answer) => answer.difficulty === followUp)) {
      targets.push({ skillId, difficulty: followUp });
    }
  }

  return targets;
}

/** The bank's question for a target, when there is one. */
export function bankQuestion(target: QuestionTarget) {
  return questionBank.find(
    (question) => question.skillId === target.skillId && question.difficulty === target.difficulty
  );
}

export function estimateMastery(answers: DiagnosticAnswer[]): MasteryMap {
  const estimates: MasteryMap = {};

  for (const skillId of new Set(answers.map((answer) => answer.skillId))) {
    const forSkill = answers.filter((answer) => answer.skillId === skillId);
    const intermediate = forSkill.find((answer) => answer.difficulty === "intermediate");

    // The ladder starts at intermediate; without it there is nothing to place.
    if (!intermediate) {
      continue;
    }

    if (intermediate.correct) {
      const advanced = forSkill.find((answer) => answer.difficulty === "advanced");
      estimates[skillId] =
        advanced?.correct ? LADDER_ESTIMATE.advancedCorrect : LADDER_ESTIMATE.intermediateOnly;
      continue;
    }

    const beginner = forSkill.find((answer) => answer.difficulty === "beginner");
    estimates[skillId] = beginner?.correct ? LADDER_ESTIMATE.beginnerOnly : LADDER_ESTIMATE.none;
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


