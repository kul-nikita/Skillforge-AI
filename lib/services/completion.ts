import { gradeAnswers, type SubmittedAnswer } from "@/lib/diagnostic/engine";
import { questionBank } from "@/lib/diagnostic/questions";
import type { DiagnosticQuestion } from "@/lib/diagnostic/types";
import type { LearningEvent } from "@/lib/adaptation/mastery";
import type { Evidence, LearningResource, ResourceType, Skill } from "@/lib/types";
import { signEvidence } from "@/lib/crypto/signing";

/** Two questions per taught skill — the same ladder depth the diagnostic uses. */
export const CHECK_QUESTIONS_PER_SKILL = 2;

/** Mastery weights a reviewed project above a quiz, so a lab must record as a lab. */
const VERB_BY_TYPE: Record<ResourceType, LearningEvent["verb"]> = {
  lab: "lab_completed",
  project: "project_reviewed",
  course: "quiz_completed",
  doc: "quiz_completed",
  video: "quiz_completed"
};

/** Hardest first, so a pass means something. */
const TIER_ORDER = ["advanced", "intermediate", "beginner"] as const;

/**
 * Product rule 4: finishing a resource cannot be self-reported, so it is graded
 * from the same server-side bank as the diagnostic. Questions the learner has
 * already answered are excluded, so a retry is not a replay.
 */
export function checkQuestionsForResource(
  resource: LearningResource,
  excludeQuestionIds: string[] = []
): DiagnosticQuestion[] {
  const excluded = new Set(excludeQuestionIds);

  return resource.skillTags.flatMap((skillId) => {
    const pool = questionBank.filter(
      (question) => question.skillId === skillId && !excluded.has(question.id)
    );

    return TIER_ORDER.flatMap((tier) => pool.filter((question) => question.difficulty === tier)).slice(
      0,
      CHECK_QUESTIONS_PER_SKILL
    );
  });
}

/**
 * Every question id the learner has already been graded on, read from the
 * append-only log. Excluding these keeps a retry from re-serving a question,
 * and refusing them on submit keeps one issued check from being graded twice.
 */
export function answeredQuestionIds(events: LearningEvent[]): string[] {
  return events.flatMap((event) => {
    const ids = event.metadata?.questionIds;
    return Array.isArray(ids) ? ids.map(String) : [];
  });
}

export type SkillResult = {
  skillId: string;
  correct: number;
  total: number;
  score: number;
  /** Recorded on the event so a later post-check does not reuse them. */
  questionIds: string[];
};

/** Graded against the bank: the client posts an index, never a verdict. */
export function gradeCompletion(
  resource: LearningResource,
  submitted: SubmittedAnswer[]
): { bySkill: SkillResult[]; overall: number } {
  const graded = new Map(
    gradeAnswers(submitted).map((answer) => [answer.questionId, answer.correct])
  );
  const skillOf = new Map(questionBank.map((question) => [question.id, question.skillId]));

  const bySkill = resource.skillTags.map((skillId) => {
    const answers = submitted.filter((answer) => skillOf.get(answer.questionId) === skillId);
    const correct = answers.filter((answer) => graded.get(answer.questionId)).length;

    return {
      skillId,
      correct,
      total: answers.length,
      score: answers.length === 0 ? 0 : correct / answers.length,
      questionIds: answers.map((answer) => answer.questionId)
    };
  });

  const answered = bySkill.filter((result) => result.total > 0);
  const overall =
    answered.length === 0
      ? 0
      : answered.reduce((sum, result) => sum + result.score, 0) / answered.length;

  return { bySkill, overall };
}

/** One append-only event per taught skill; mastery is derived from them on read. */
export function completionEvents(
  learnerId: string,
  resource: LearningResource,
  bySkill: SkillResult[],
  timestamp: string
): LearningEvent[] {
  return bySkill
    .filter((result) => result.total > 0)
    .map((result) => ({
      learnerId,
      verb: VERB_BY_TYPE[resource.resourceType],
      objectType: "resource" as const,
      objectId: resource.id,
      skillId: result.skillId,
      score: result.score,
      durationMinutes: resource.durationMinutes,
      timestamp,
      metadata: { correct: result.correct, total: result.total, questionIds: result.questionIds }
    }));
}

export const EVIDENCE_THRESHOLD = 0.5;

/**
 * Every field records something that happened: the rubric score is the graded
 * check, capabilities are the skills passed (named from the graph), and
 * `artifactUrl` stays null unless the learner supplied one. No LLM involved.
 */
export function completionEvidence({
  learnerId,
  resource,
  bySkill,
  overall,
  summary,
  artifactUrl,
  skills,
  timestamp
}: {
  learnerId: string;
  resource: LearningResource;
  bySkill: SkillResult[];
  overall: number;
  summary: string;
  artifactUrl: string | null;
  skills: Skill[];
  timestamp: string;
}): Omit<Evidence, "id" | "signature"> | null {
  if (!resource.evidenceType || overall < EVIDENCE_THRESHOLD) {
    return null;
  }

  const name = new Map(skills.map((skill) => [skill.id, skill.name]));
  const passed = bySkill.filter((result) => result.total > 0 && result.score >= EVIDENCE_THRESHOLD);

  return {
    learnerId,
    // A skill actually demonstrated: the first taught one may be the failed one.
    skillId: passed[0]?.skillId ?? bySkill[0]?.skillId ?? resource.skillTags[0],
    resourceId: resource.id,
    summary,
    evidenceType: resource.evidenceType,
    artifactUrl,
    rubricScore: overall,
    validatedCapabilities: passed.map(
      (result) =>
        `${name.get(result.skillId) ?? result.skillId} — ${result.correct}/${result.total} on the post-check`
    ),
    createdAt: timestamp
  };
}
