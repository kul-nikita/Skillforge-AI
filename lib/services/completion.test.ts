import { describe, expect, it } from "vitest";
import {
  CHECK_QUESTIONS_PER_SKILL,
  answeredQuestionIds,
  checkQuestionsForResource,
  completionEvents,
  completionEvidence,
  gradeCompletion
} from "@/lib/services/completion";
import { questionBank } from "@/lib/diagnostic/questions";
import { allResources, allSkills } from "@/seed/data";
import type { LearningResource } from "@/lib/types";

const resource = allResources.find((row) => row.skillTags.length > 0)!;

function answersFor(target: LearningResource, correct: boolean) {
  return checkQuestionsForResource(target).map((question) => ({
    questionId: question.id,
    selectedIndex: correct ? question.correctIndex : (question.correctIndex + 1) % question.options.length
  }));
}

describe("completion post-check", () => {
  it("draws questions for every skill the resource teaches", () => {
    const questions = checkQuestionsForResource(resource);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.length).toBeLessThanOrEqual(
      resource.skillTags.length * CHECK_QUESTIONS_PER_SKILL
    );
    for (const question of questions) {
      expect(resource.skillTags).toContain(question.skillId);
    }
  });

  it("never reuses a question the learner already answered", () => {
    const first = checkQuestionsForResource(resource);
    const second = checkQuestionsForResource(
      resource,
      first.map((question) => question.id)
    );
    const ids = new Set(first.map((question) => question.id));
    expect(second.every((question) => !ids.has(question.id))).toBe(true);
  });

  // The whole point of grading server-side: a learner cannot award themselves
  // mastery by claiming completion.
  it("scores a wrong run at zero and a right run at one", () => {
    expect(gradeCompletion(resource, answersFor(resource, false)).overall).toBe(0);
    expect(gradeCompletion(resource, answersFor(resource, true)).overall).toBe(1);
  });

  it("ignores an unknown question id rather than crediting it", () => {
    const { overall } = gradeCompletion(resource, [
      { questionId: "not-a-real-question", selectedIndex: 0 }
    ]);
    expect(overall).toBe(0);
  });

  it("records a lab as a lab so mastery weights it correctly", () => {
    const lab = allResources.find((row) => row.resourceType === "lab" && row.skillTags.length > 0)!;
    const { bySkill } = gradeCompletion(lab, answersFor(lab, true));
    const events = completionEvents("learner-1", lab, bySkill, "2026-08-27");
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.verb === "lab_completed")).toBe(true);
    expect(events.every((event) => event.score === 1)).toBe(true);
  });

  it("withholds evidence when the post-check was failed", () => {
    const withEvidence = allResources.find(
      (row) => row.evidenceType !== null && row.skillTags.length > 0
    )!;
    const { bySkill, overall } = gradeCompletion(withEvidence, answersFor(withEvidence, false));

    expect(
      completionEvidence({
        learnerId: "learner-1",
        resource: withEvidence,
        bySkill,
        overall,
        summary: "I did the thing.",
        artifactUrl: null,
        skills: allSkills,
        timestamp: "2026-08-27"
      })
    ).toBeNull();
  });

  it("issues evidence with the graded score and never a fabricated artifact", () => {
    const withEvidence = allResources.find(
      (row) => row.evidenceType !== null && row.skillTags.length > 0
    )!;
    const { bySkill, overall } = gradeCompletion(withEvidence, answersFor(withEvidence, true));
    const evidence = completionEvidence({
      learnerId: "learner-1",
      resource: withEvidence,
      bySkill,
      overall,
      summary: "I did the thing.",
      artifactUrl: null,
      skills: allSkills,
      timestamp: "2026-08-27"
    })!;

    expect(evidence.rubricScore).toBe(1);
    expect(evidence.artifactUrl).toBeNull();
    expect(evidence.evidenceType).toBe(withEvidence.evidenceType);
    expect(evidence.validatedCapabilities.length).toBeGreaterThan(0);
  });

  // The issued-question token carries no server state, so the log is what stops
  // one graded sitting being submitted repeatedly to mint evidence and inflate
  // mastery. If this stops finding the ids, /api/complete becomes replayable.
  it("reports the question ids a completion was graded on, so a replay can be refused", () => {
    const answers = answersFor(resource, true);
    const { bySkill } = gradeCompletion(resource, answers);
    const events = completionEvents("learner-1", resource, bySkill, "2026-09-09");

    const graded = answeredQuestionIds(events);

    expect(graded.length).toBe(answers.length);
    for (const answer of answers) {
      expect(graded).toContain(answer.questionId);
    }
  });

  it("ignores events that carry no question ids", () => {
    expect(
      answeredQuestionIds([
        { learnerId: "l", verb: "quiz_completed", objectType: "resource", objectId: "r", skillId: "s", score: 1, timestamp: "t" }
      ])
    ).toEqual([]);
  });

  // Guards the assumption that a completion is checkable at all: a resource
  // teaching a skill with no questions would silently produce no events.
  it("has post-check coverage for every skill taught by a curated resource", () => {
    const covered = new Set(questionBank.map((question) => question.skillId));
    const uncovered = [
      ...new Set(allResources.flatMap((row) => row.skillTags).filter((id) => !covered.has(id)))
    ];
    expect(uncovered).toEqual([]);
  });
});
