import { describe, expect, it } from "vitest";
import { roles } from "@/lib/data/domains/cybersecurity";
import { allRoles } from "@/seed/data";
import { questionBank } from "@/lib/diagnostic/questions";
import {
  MAX_QUESTIONS,
  estimateMastery,
  gradeAnswers,
  selectNextQuestion,
  type DiagnosticAnswer
} from "@/lib/diagnostic/engine";

const socAnalyst = roles.find((role) => role.id === "soc-analyst")!;

/** Answer every served question with `correct` until the diagnostic ends. */
function runDiagnostic(decide: (question: (typeof questionBank)[number]) => boolean) {
  const answers: DiagnosticAnswer[] = [];
  let question = selectNextQuestion(socAnalyst, answers);

  while (question) {
    answers.push({ questionId: question.id, correct: decide(question) });
    question = selectNextQuestion(socAnalyst, answers);
  }

  return answers;
}

describe("diagnostic engine", () => {
  it("gives every skill all three difficulty tiers the ladder needs", () => {
    const skillIds = new Set(questionBank.map((question) => question.skillId));

    for (const skillId of skillIds) {
      const tiers = questionBank.filter((question) => question.skillId === skillId).map((q) => q.difficulty);
      expect(new Set(tiers)).toEqual(new Set(["beginner", "intermediate", "advanced"]));
    }
  });

  it("grades a submitted option index against the answer key", () => {
    const question = questionBank[0];
    const wrongIndex = question.options.findIndex((_, index) => index !== question.correctIndex);

    expect(gradeAnswers([{ questionId: question.id, selectedIndex: question.correctIndex }])).toEqual([
      { questionId: question.id, correct: true }
    ]);
    expect(gradeAnswers([{ questionId: question.id, selectedIndex: wrongIndex }])).toEqual([
      { questionId: question.id, correct: false }
    ]);
  });

  it("grades a skip (-1) and an unknown question as incorrect", () => {
    expect(gradeAnswers([{ questionId: questionBank[0].id, selectedIndex: -1 }])[0].correct).toBe(false);
    expect(gradeAnswers([{ questionId: "no-such-question", selectedIndex: 0 }])[0].correct).toBe(false);
  });

  it("branches up to advanced on a correct intermediate answer", () => {
    const first = selectNextQuestion(socAnalyst, [])!;
    expect(first.difficulty).toBe("intermediate");

    const next = selectNextQuestion(socAnalyst, [{ questionId: first.id, correct: true }])!;
    expect(next.skillId).toBe(first.skillId);
    expect(next.difficulty).toBe("advanced");
  });

  it("branches down to beginner on a wrong intermediate answer", () => {
    const first = selectNextQuestion(socAnalyst, [])!;
    const next = selectNextQuestion(socAnalyst, [{ questionId: first.id, correct: false }])!;

    expect(next.skillId).toBe(first.skillId);
    expect(next.difficulty).toBe("beginner");
  });

  it("terminates within the question cap and covers the role's skills", () => {
    const answers = runDiagnostic(() => true);

    expect(answers.length).toBeLessThanOrEqual(MAX_QUESTIONS);
    expect(Object.keys(estimateMastery(answers)).sort()).toEqual(
      socAnalyst.requiredSkills.map((skill) => skill.skillId).sort()
    );
  });

  it("scores an all-correct run above an all-wrong run for every skill", () => {
    const strong = estimateMastery(runDiagnostic(() => true));
    const weak = estimateMastery(runDiagnostic(() => false));

    for (const { skillId } of socAnalyst.requiredSkills) {
      expect(strong[skillId]).toBe(0.9);
      expect(weak[skillId]).toBe(0.1);
    }
  });

  it("rates intermediate-only above beginner-only", () => {
    const answers = runDiagnostic((question) => question.difficulty !== "advanced");
    const skillId = socAnalyst.requiredSkills[0].skillId;

    expect(estimateMastery(answers)[skillId]).toBe(0.7);
    expect(estimateMastery(runDiagnostic((q) => q.difficulty === "beginner"))[skillId]).toBe(0.4);
  });
});

describe("question bank covers every seeded role", () => {
  // Without all three tiers `selectNextQuestion` just skips the skill, so a new
  // domain would end the diagnostic early rather than fail loudly.
  it.each(allRoles.map((role) => [role.id, role] as const))(
    "%s has a beginner, intermediate, and advanced question for every required skill",
    (_id, role) => {
      for (const { skillId } of role.requiredSkills) {
        for (const difficulty of ["beginner", "intermediate", "advanced"] as const) {
          const question = questionBank.find(
            (candidate) => candidate.skillId === skillId && candidate.difficulty === difficulty
          );
          expect(question, `${role.id}: no ${difficulty} question for ${skillId}`).toBeDefined();
        }
      }
    }
  );

  it("asks a real first question for every role, in every domain", () => {
    for (const role of allRoles) {
      expect(selectNextQuestion(role, []), `${role.id} starts with no question`).not.toBeNull();
    }
  });

  it("uses unique question ids across domains", () => {
    const ids = questionBank.map((question) => question.id);
    expect(new Set(ids).size, "duplicate question id").toBe(ids.length);
  });

  it("points every correctIndex at an option that exists", () => {
    for (const question of questionBank) {
      expect(question.options.length, `${question.id} needs at least two options`).toBeGreaterThan(1);
      expect(question.options[question.correctIndex], `${question.id} correctIndex out of range`).toBeDefined();
    }
  });
});
