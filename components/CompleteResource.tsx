"use client";

import { useState } from "react";
import { Award, CheckCircle2, Loader2, MessageSquare } from "lucide-react";
import { InterviewFlow } from "@/components/InterviewFlow";
import { ProgressNote } from "@/components/ProgressNote";

type Question = {
  id: string;
  skillId: string;
  difficulty: string;
  prompt: string;
  options: string[];
};

type SkillResult = { skillId: string; correct: number; total: number; score: number };

type Outcome = {
  persisted: boolean;
  score: number;
  bySkill: SkillResult[];
  evidence: { evidenceType: string; validatedCapabilities: string[] } | null;
};

/**
 * Finishing a resource is where mastery moves, so it cannot be a checkbox
 * (product rule 4): a server-graded post-check and the learner's own summary
 * come first, and only then is an event appended and evidence issued.
 */
export function CompleteResource({
  resourceId,
  skillId,
  skillName,
  onCompleted
}: {
  resourceId: string;
  skillId?: string;
  skillName?: string;
  onCompleted?: (mastery: Record<string, number>) => void;
}) {
  const [mode, setMode] = useState<"choose" | "quiz" | "interview">("choose");
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  // Signed proof of which questions were issued; grading rejects a submission without it.
  const [token, setToken] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [summary, setSummary] = useState("");
  const [artifactUrl, setArtifactUrl] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startQuiz() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/complete?resourceId=${encodeURIComponent(resourceId)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(String(data.error ?? "Could not load the check."));
        return;
      }
      setQuestions(data.questions);
      setToken(data.token);
      setOpen(true);
      setMode("quiz");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!questions || !token) {
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceId,
          token,
          // -1 is "skipped" and grades as incorrect, as in the diagnostic.
          answers: questions.map((question) => ({
            questionId: question.id,
            selectedIndex: picked[question.id] ?? -1
          })),
          summary,
          artifactUrl: artifactUrl.trim() || null
        })
      });
      const data = await res.json();

      if (!res.ok) {
        const fieldErrors = data.error?.fieldErrors as Record<string, string[]> | undefined;
        setError(
          fieldErrors
            ? Object.entries(fieldErrors)
                .map(([field, messages]) => `${field}: ${messages.join(", ")}`)
                .join(" · ")
            : String(data.error ?? "Could not record that.")
        );
        return;
      }

      setOutcome(data);
      onCompleted?.(data.mastery ?? {});
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (outcome) {
    return (
      <div className="mt-4 rounded-md border border-border bg-canvas p-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 aria-hidden="true" className="text-teal" size={18} />
          <p className="font-medium text-ink">
            Post-check scored {Math.round(outcome.score * 100)}%
          </p>
        </div>

        <ul className="mt-2 space-y-1 text-sm text-muted">
          {outcome.bySkill
            .filter((result) => result.total > 0)
            .map((result) => (
              <li key={result.skillId}>
                {result.skillId} — {result.correct}/{result.total} correct, mastery updated to{" "}
                {Math.round(result.score * 100)}%
              </li>
            ))}
        </ul>

        {outcome.evidence ? (
          <p className="mt-3 flex items-start gap-2 text-sm text-ink">
            <Award aria-hidden="true" className="mt-0.5 shrink-0 text-teal" size={16} />
            <span>
              Evidence issued: <strong className="font-medium">{outcome.evidence.evidenceType}</strong>{" "}
              with {outcome.evidence.validatedCapabilities.length} validated{" "}
              {outcome.evidence.validatedCapabilities.length === 1 ? "capability" : "capabilities"}.
              It is in your evidence wallet.
            </span>
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted">
            No evidence issued — the post-check has to clear 50% for this to count as demonstrated.
            Your attempt is still in the log.
          </p>
        )}

        {!outcome.persisted ? (
          <p className="mt-3 text-sm text-amber-200">
            Nothing was saved: analysis of your learning data needs consent, which you can give in
            account settings.
          </p>
        ) : (
          <ProgressNote />
        )}
      </div>
    );
  }

  if (mode === "interview" && skillId && skillName) {
    return (
      <div className="mt-4">
        <InterviewFlow
          resourceId={resourceId}
          skillId={skillId}
          skillName={skillName}
          onComplete={(evidenceId) => {
            if (evidenceId) {
              setOutcome({
                persisted: true,
                score: 0,
                bySkill: [],
                evidence: {
                  evidenceType: "verification-interview",
                  validatedCapabilities: ["Passed AI verification interview"]
                }
              });
            } else {
              setMode("choose");
            }
          }}
          onCancel={() => setMode("choose")}
        />
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mt-4">
        {mode === "choose" && skillId && skillName ? (
          <div className="rounded-md border border-border bg-canvas p-4">
            <h4 className="font-medium text-ink">How would you like to verify this?</h4>
            <p className="mt-1 text-sm text-muted">
              Choose how to demonstrate your understanding of this resource.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-semibold text-ink hover:border-teal disabled:opacity-60"
                disabled={busy}
                onClick={startQuiz}
                type="button"
              >
                {busy ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
                Quick Post-Check Quiz
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md bg-teal px-4 text-sm font-semibold text-white hover:bg-teal-strong disabled:opacity-60"
                disabled={busy}
                onClick={() => setMode("interview")}
                type="button"
              >
                <MessageSquare size={16} />
                AI Verification Interview
              </button>
            </div>
          </div>
        ) : (
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-semibold text-ink hover:border-teal disabled:opacity-60"
            disabled={busy}
            onClick={startQuiz}
            type="button"
          >
            {busy ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
            I finished this
          </button>
        )}
        {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
      </div>
    );
  }

  const answered = questions?.every((question) => picked[question.id] !== undefined) ?? false;

  return (
    <div className="mt-4 rounded-md border border-border bg-canvas p-4">
      <h4 className="font-medium text-ink">Quick check before this counts</h4>
      <p className="mt-1 text-sm text-muted">
        Graded on the server — the answer key never reaches your browser, so this is worth
        something to a recruiter.
      </p>

      {questions?.map((question) => (
        <fieldset className="mt-4" key={question.id}>
          <legend className="text-sm font-medium text-ink">{question.prompt}</legend>
          <div className="mt-2 space-y-1">
            {question.options.map((option, index) => (
              <label className="flex cursor-pointer gap-2 text-sm text-ink" key={option}>
                <input
                  checked={picked[question.id] === index}
                  className="mt-1"
                  name={question.id}
                  onChange={() => setPicked((current) => ({ ...current, [question.id]: index }))}
                  type="radio"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <label className="mt-5 block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
          What did you actually do? (your words, shown on the evidence card)
        </span>
        <textarea
          className="h-20 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-teal"
          onChange={(event) => setSummary(event.target.value)}
          value={summary}
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
          Link to your artifact (optional — left blank rather than faked)
        </span>
        <input
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-teal"
          onChange={(event) => setArtifactUrl(event.target.value)}
          placeholder="https://github.com/you/writeup"
          value={artifactUrl}
        />
      </label>

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

      <div className="mt-4 flex gap-2">
        <button
          className="inline-flex h-10 items-center gap-2 rounded-md bg-teal px-4 text-sm font-semibold text-white hover:bg-teal-strong disabled:opacity-60"
          disabled={busy || !answered || summary.trim().length < 10}
          onClick={submit}
          type="button"
        >
          {busy ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
          Submit and record
        </button>
        <button
          className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-semibold hover:border-teal"
          onClick={() => setOpen(false)}
          type="button"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
