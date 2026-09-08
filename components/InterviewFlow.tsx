"use client";

import { useState } from "react";
import { MessageSquare, Check, X, Loader2, Award } from "lucide-react";

type Question = {
  id: string;
  question: string;
  context: string;
};

type GradingResult = {
  scores: number[];
  feedback: string[];
  overall: number;
};

export function InterviewFlow({
  resourceId,
  skillId,
  skillName,
  onComplete,
  onCancel
}: {
  resourceId: string;
  skillId: string;
  skillName: string;
  onComplete: (evidenceId: string | null) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"intro" | "questions" | "submitting" | "results">("intro");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grading, setGrading] = useState<GradingResult | null>(null);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [summary, setSummary] = useState("");

  async function startInterview() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceId, skillId })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = typeof body.error === "string" ? body.error : `Request failed: ${res.status}`;
        throw new Error(msg);
      }

      const data = await res.json();
      setQuestions(data.questions);
      setToken(data.token);
      setStep("questions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate questions");
    } finally {
      setLoading(false);
    }
  }

  function updateAnswer(questionId: string, answer: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  }

  function nextQuestion() {
    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
    }
  }

  function prevQuestion() {
    if (currentQ > 0) {
      setCurrentQ(currentQ - 1);
    }
  }

  async function submitInterview() {
    setStep("submitting");
    setLoading(true);
    setError(null);

    try {
      const answerArray = questions.map((q) => ({
        questionId: q.id,
        answer: answers[q.id] || ""
      }));

      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions,
          answers: answerArray,
          resourceId,
          skillId,
          token,
          summary: summary.trim() || `Completed verification interview for ${skillName}`
        })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = typeof body.error === "string" ? body.error : `Request failed: ${res.status}`;
        throw new Error(msg);
      }

      const data = await res.json();
      setGrading(data.grading);
      setEvidenceId(data.evidenceId);
      setStep("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grade interview");
      setStep("questions");
    } finally {
      setLoading(false);
    }
  }

  const allAnswered = questions.every((q) => (answers[q.id] || "").trim().length >= 10);

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      {/* Intro */}
      {step === "intro" && (
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="text-teal" size={20} />
            <h3 className="text-lg font-semibold text-ink">AI Verification Interview</h3>
          </div>
          <p className="mt-2 text-sm text-muted">
            Answer 5 scenario-based questions about {skillName}. An AI interviewer will
            evaluate your responses and, if you pass, produce a higher-confidence
            evidence entry.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-muted">
            <li className="flex gap-2">
              <Check size={14} className="mt-0.5 shrink-0 text-teal" />
              5 open-ended scenario questions
            </li>
            <li className="flex gap-2">
              <Check size={14} className="mt-0.5 shrink-0 text-teal" />
              Graded on accuracy, depth, and practical application
            </li>
            <li className="flex gap-2">
              <Check size={14} className="mt-0.5 shrink-0 text-teal" />
              Score of 50% or higher produces a verified credential
            </li>
          </ul>
          <div className="mt-6 flex gap-3">
            <button
              onClick={startInterview}
              disabled={loading}
              type="button"
              className="inline-flex items-center gap-2 rounded-md bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-strong disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating questions...
                </>
              ) : (
                <>
                  <MessageSquare size={16} />
                  Start Interview
                </>
              )}
            </button>
            <button
              onClick={onCancel}
              type="button"
              className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-ink hover:bg-canvas"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Questions */}
      {step === "questions" && questions.length > 0 && (
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="text-teal" size={20} />
              <h3 className="text-lg font-semibold text-ink">Question {currentQ + 1} of {questions.length}</h3>
            </div>
            <span className="text-sm text-muted">
              {Object.keys(answers).length}/{questions.length} answered
            </span>
          </div>

          {/* Progress */}
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-teal transition-all"
              style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }}
            />
          </div>

          {/* Current Question */}
          <div className="mt-6">
            <div className="rounded-md bg-canvas p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Scenario
              </p>
              <p className="mt-1 text-sm text-ink">{questions[currentQ].context}</p>
            </div>
            <h4 className="mt-4 text-base font-medium text-ink">
              {questions[currentQ].question}
            </h4>
            <textarea
              className="mt-3 w-full rounded-md border border-border bg-canvas p-3 text-sm text-ink placeholder:text-muted focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              rows={4}
              placeholder="Type your answer here... (minimum 10 characters)"
              value={answers[questions[currentQ].id] || ""}
              onChange={(e) => updateAnswer(questions[currentQ].id, e.target.value)}
            />
          </div>

          {/* Evidence summary — collected BEFORE grading, because the grade
              response is what mints the evidence record. */}
          {currentQ === questions.length - 1 && (
            <div className="mt-6">
              <label className="text-sm font-medium text-ink" htmlFor="interview-summary">
                Brief summary for your evidence record (optional):
              </label>
              <textarea
                id="interview-summary"
                className="mt-2 w-full rounded-md border border-border bg-canvas p-3 text-sm text-ink placeholder:text-muted focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                rows={2}
                placeholder={`Describe what you demonstrated about ${skillName}...`}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            </div>
          )}

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={prevQuestion}
              disabled={currentQ === 0}
              type="button"
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-50"
            >
              Previous
            </button>
            <div className="flex gap-2">
              {currentQ < questions.length - 1 ? (
                <button
                  onClick={nextQuestion}
                  type="button"
                  className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-strong"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={submitInterview}
                  disabled={!allAnswered || loading}
                  type="button"
                  className="inline-flex items-center gap-2 rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-strong disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Grading...
                    </>
                  ) : (
                    "Submit Interview"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Submitting */}
      {step === "submitting" && (
        <div className="flex flex-col items-center py-12">
          <Loader2 size={48} className="animate-spin text-teal" />
          <p className="mt-4 text-lg font-semibold text-ink">Grading your interview...</p>
          <p className="mt-1 text-sm text-muted">
            The AI is evaluating your responses for accuracy, depth, and practical application.
          </p>
        </div>
      )}

      {/* Results */}
      {step === "results" && grading && (
        <div>
          <div className="flex items-center gap-2">
            <Award className="text-teal" size={20} />
            <h3 className="text-lg font-semibold text-ink">Interview Results</h3>
          </div>

          {/* Overall Score */}
          <div className="mt-4 flex items-center gap-4">
            <div className="relative inline-flex items-center justify-center">
              <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="3"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke={grading.overall >= 0.5 ? "#14b8a6" : "#ef4444"}
                  strokeWidth="3"
                  strokeDasharray={`${grading.overall * 100}, 100`}
                />
              </svg>
              <span className="absolute text-xl font-bold text-ink">
                {Math.round(grading.overall * 100)}%
              </span>
            </div>
            <div>
              <p className="font-semibold text-ink">
                {grading.overall >= 0.5 ? "Congratulations! You passed." : "Not quite there yet."}
              </p>
              <p className="text-sm text-muted">
                {grading.overall >= 0.5
                  ? "A verified credential has been added to your evidence wallet."
                  : "Keep studying and try again when you're ready."}
              </p>
            </div>
          </div>

          {/* Per-question breakdown */}
          <div className="mt-6 space-y-3">
            {questions.map((q, i) => (
              <div key={q.id} className="rounded-md border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink">{q.question}</p>
                    <p className="mt-1 text-xs text-muted">
                      Your answer: {(answers[q.id] || "").slice(0, 100)}...
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      grading.scores[i] >= 0.5
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-red-500/10 text-red-300"
                    }`}
                  >
                    {Math.round(grading.scores[i] * 100)}%
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted">{grading.feedback[i]}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => onComplete(evidenceId)}
              type="button"
              className="rounded-md bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-strong"
            >
              {evidenceId ? "View Evidence Wallet" : "Back to Resource"}
            </button>
            <button
              onClick={() => {
                setStep("intro");
                setGrading(null);
                setAnswers({});
                setCurrentQ(0);
              }}
              type="button"
              className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-ink hover:bg-canvas"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
