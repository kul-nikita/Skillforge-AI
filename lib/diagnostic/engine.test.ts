import { describe, expect, it } from "vitest";
import { roles } from "@/lib/data/domains/cybersecurity";
import { allRoles } from "@/seed/data";
import { questionBank } from "@/lib/diagnostic/questions";
import {
  MAX_QUESTIONS,
  bankQuestion,
  estimateMastery,
  gradeAnswers,
  remainingTargets,
  type DiagnosticAnswer
} from "@/lib/diagnostic/engine";
import { issueToken } from "@/lib/crypto/signing";

const socAnalyst = roles.find((role) => role.id === "soc-analyst")!;

/** The next thing to ask, as the route asks for it. */
function nextTarget(answers: DiagnosticAnswer[]) {
  return remainingTargets(socAnalyst, answers)[0] ?? null;
}

/** Answer every served question with `correct` until the diagnostic ends. */
function runDiagnostic(decide: (question: (typeof questionBank)[number]) => boolean) {
  const answers: DiagnosticAnswer[] = [];
  let target = nextTarget(answers);

  while (target) {
    const question = bankQuestion(target)!;
    answers.push({
      questionId: question.id,
      skillId: target.skillId,
      difficulty: target.difficulty,
      correct: decide(question)
    });
    target = nextTarget(answers);
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

    expect(
      gradeAnswers([{ questionId: question.id, selectedIndex: question.correctIndex }], "learner-1")
    ).toEqual([
      {
        questionId: question.id,
        skillId: question.skillId,
        difficulty: question.difficulty,
        correct: true
      }
    ]);
    expect(gradeAnswers([{ questionId: question.id, selectedIndex: wrongIndex }], "learner-1")[0].correct).toBe(
      false
    );
  });

  it("grades a skip (-1) and an unknown question as incorrect", () => {
    expect(gradeAnswers([{ questionId: questionBank[0].id, selectedIndex: -1 }], "l")[0].correct).toBe(false);
    // An id that is neither in the bank nor backed by a token is dropped: there
    // is no key to grade it against, and scoring it as wrong would let a caller
    // pad the run with fake ids to drag an estimate down.
    expect(gradeAnswers([{ questionId: "no-such-question", selectedIndex: 0 }], "l")).toEqual([]);
  });

  it("grades a generated question against the key sealed in its own token", () => {
    // A model-written question is in no bank, so the only record of its answer
    // is the signed token the route issued.
    const token = issueToken(
      {
        learnerId: "learner-1",
        questionId: "gen-alert-triage-intermediate-0",
        skillId: "alert-triage",
        difficulty: "intermediate",
        correctIndex: 2
      },
      60_000
    );

    expect(
      gradeAnswers([{ questionId: "gen-alert-triage-intermediate-0", selectedIndex: 2, token }], "learner-1")
    ).toEqual([
      {
        questionId: "gen-alert-triage-intermediate-0",
        skillId: "alert-triage",
        difficulty: "intermediate",
        correct: true
      }
    ]);
  });

  it("refuses a token issued to a different learner", () => {
    // Otherwise a learner could replay someone else's issued question, or a
    // token they harvested from an earlier account, and be graded on it.
    const token = issueToken(
      {
        learnerId: "learner-1",
        questionId: "gen-x",
        skillId: "alert-triage",
        difficulty: "intermediate",
        correctIndex: 0
      },
      60_000
    );

    expect(gradeAnswers([{ questionId: "gen-x", selectedIndex: 0, token }], "learner-2")).toEqual([]);
  });

  it("refuses a token that does not name the question being answered", () => {
    // Swapping in the token of an easier question would otherwise grade this
    // answer against the wrong key.
    const token = issueToken(
      {
        learnerId: "learner-1",
        questionId: "gen-easy",
        skillId: "alert-triage",
        difficulty: "beginner",
        correctIndex: 0
      },
      60_000
    );

    expect(gradeAnswers([{ questionId: "gen-hard", selectedIndex: 0, token }], "learner-1")).toEqual([]);
  });

  it("refuses a forged token", () => {
    expect(
      gradeAnswers([{ questionId: "gen-x", selectedIndex: 0, token: "not.a-real-token" }], "learner-1")
    ).toEqual([]);
  });

  it("branches up to advanced on a correct intermediate answer", () => {
    const first = nextTarget([])!;
    expect(first.difficulty).toBe("intermediate");

    const next = nextTarget([
      { questionId: "q1", skillId: first.skillId, difficulty: "intermediate", correct: true }
    ])!;
    expect(next.skillId).toBe(first.skillId);
    expect(next.difficulty).toBe("advanced");
  });

  it("branches down to beginner on a wrong intermediate answer", () => {
    const first = nextTarget([])!;
    const next = nextTarget([
      { questionId: "q1", skillId: first.skillId, difficulty: "intermediate", correct: false }
    ])!;

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
  // Without all three tiers the bank cannot back a target the planner asks for,
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
      const target = remainingTargets(role, [])[0];
      expect(target, `${role.id} starts with no question`).toBeDefined();
      expect(bankQuestion(target!), `${role.id} has no bank fallback`).toBeDefined();
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
