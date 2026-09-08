import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import {
  generateInterviewQuestions,
  gradeInterviewAnswers,
  interviewAnswerSchema,
  interviewQuestionSchema
} from "@/lib/llm/interview";
import { findResourcesByIds } from "@/lib/db/resources";
import { getSkillsByIds } from "@/lib/graph/queries";
import { addEvidence } from "@/lib/db/learners";
import { fingerprint, issueToken, tokenMatches } from "@/lib/crypto/signing";
import { LlmError } from "@/lib/llm/client";

export const dynamic = "force-dynamic";

const generateSchema = z.object({
  resourceId: z.string().min(1),
  skillId: z.string().min(1)
});

const gradeSchema = z.object({
  questions: z.array(interviewQuestionSchema).min(1).max(10),
  answers: z.array(interviewAnswerSchema).min(1).max(10),
  resourceId: z.string().min(1),
  skillId: z.string().min(1),
  summary: z.string().min(10).max(1000),
  /** Issued alongside the questions; proves the model wrote them, not the learner. */
  token: z.string().min(1)
});

const EVIDENCE_THRESHOLD = 0.5;
const INTERVIEW_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

/** What the token commits to: these exact questions, for this learner and skill. */
function questionsFingerprint(questions: Array<{ id: string; question: string }>) {
  return fingerprint(questions.map((question) => `${question.id}::${question.question}`));
}

function llmFailure(error: unknown) {
  if (error instanceof LlmError) {
    console.error("[interview] gemini call failed:", error.message);
    return NextResponse.json(
      { error: "The AI interviewer is unavailable right now. Try again in a moment." },
      { status: 502 }
    );
  }
  throw error;
}

/** Generates the questions, or grades the answers to questions it generated. */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  const isGradeRequest = body && typeof body === "object" && "answers" in body && "questions" in body;

  if (isGradeRequest) {
    const parsed = gradeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { questions, answers, resourceId, skillId, summary, token } = parsed.data;

    // Without this the questions are whatever the client felt like being asked:
    // five "what is 2+2" prompts grade at 100% and mint signed evidence.
    const issued = tokenMatches(token, {
      k: "interview",
      u: user.id,
      r: resourceId,
      s: skillId,
      f: questionsFingerprint(questions)
    });

    if (!issued) {
      return NextResponse.json(
        { error: "That interview has expired or does not match. Start it again." },
        { status: 400 }
      );
    }

    const [resource] = await findResourcesByIds([resourceId]);
    if (!resource) {
      return NextResponse.json({ error: `Unknown resource: ${resourceId}` }, { status: 404 });
    }

    const [skill] = await getSkillsByIds([skillId]);
    if (!skill) {
      return NextResponse.json({ error: `Unknown skill: ${skillId}` }, { status: 404 });
    }

    let grading;
    try {
      grading = await gradeInterviewAnswers(questions, answers, skill);
    } catch (error) {
      return llmFailure(error);
    }

    let evidenceId: string | null = null;
    if (grading.overall >= EVIDENCE_THRESHOLD && user.consentGiven) {
      // Scores are re-shaped to the question count upstream, so index i is
      // always question i.
      const validatedCapabilities = questions
        .map((question, index) => ({ question, score: grading.scores[index] }))
        .filter((entry) => entry.score >= EVIDENCE_THRESHOLD)
        .map(
          (entry) =>
            `${skill.name} — ${Math.round(entry.score * 100)}% on: ${entry.question.question.slice(0, 60)}...`
        );

      if (validatedCapabilities.length > 0) {
        const evidence = await addEvidence({
          learnerId: user.id,
          skillId,
          resourceId,
          summary,
          evidenceType: "verification-interview",
          artifactUrl: null,
          rubricScore: grading.overall,
          validatedCapabilities,
          createdAt: new Date().toISOString()
        });
        evidenceId = evidence.id;
      }
    }

    return NextResponse.json({
      grading,
      evidenceId,
      passed: grading.overall >= EVIDENCE_THRESHOLD
    });
  }

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { resourceId, skillId } = parsed.data;

  const [resource] = await findResourcesByIds([resourceId]);
  if (!resource) {
    return NextResponse.json({ error: `Unknown resource: ${resourceId}` }, { status: 404 });
  }

  const [skill] = await getSkillsByIds([skillId]);
  if (!skill) {
    return NextResponse.json({ error: `Unknown skill: ${skillId}` }, { status: 404 });
  }

  if (!resource.skillTags.includes(skillId)) {
    return NextResponse.json(
      { error: "That resource does not teach that skill." },
      { status: 400 }
    );
  }

  let questions;
  try {
    questions = await generateInterviewQuestions(resource, skill);
  } catch (error) {
    return llmFailure(error);
  }

  return NextResponse.json({
    resource: { id: resource.id, title: resource.title },
    skill: { id: skill.id, name: skill.name },
    questions,
    token: issueToken(
      {
        k: "interview",
        u: user.id,
        r: resource.id,
        s: skill.id,
        f: questionsFingerprint(questions)
      },
      INTERVIEW_TOKEN_TTL_MS
    )
  });
}
