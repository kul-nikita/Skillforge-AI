"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Route,
  ShieldCheck,
  Sparkles,
  TrendingUp
} from "lucide-react";
import { CompleteResource } from "@/components/CompleteResource";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import { summariseDelta, type DiagnosticDelta } from "@/lib/diagnostic/delta";
import type { Blocker, ScoreBreakdown as ScoreBreakdownType } from "@/lib/types";
import { GapReason } from "@/components/GapReason";
import { MentorPanel } from "@/components/MentorPanel";

type Question = {
  id: string;
  skillId: string;
  skillName: string;
  difficulty: string;
  prompt: string;
  options: string[];
  /** Why this learner is being asked this. Null for a question from the bank. */
  rationale: string | null;
  written: "model" | "bank";
};

/** The token is the server's sealed record of the question it issued; it comes
 * back untouched so a stateless route can grade without ever having sent the
 * answer key to the browser. */
type Answer = { questionId: string; selectedIndex: number; token?: string };

type Recommendation = {
  resource: { id: string; title: string; provider: string; url: string; costType: string };
  score: ScoreBreakdownType;
  explanation: { whatGapItCloses: string; estimatedTime: string; evidenceArtifact: string };
};

type Roadmap = {
  roadmap: {
    role: { title: string };
    readiness: number;
    gaps: Array<{
      skill: { id: string; name: string };
      currentMastery: number;
      reason: string;
      blockedBy: Blocker[];
      unlocks: string[];
    }>;
    mastered: Array<{ skill: { id: string; name: string } }>;
  };
  recommendations: Recommendation[];
};

type WeeklyPlan = {
  outcome: { action: string; message: string; delayedSkillIds: string[]; remediation: { title: string } | null } | null;
  plan: {
    weeklyHours: number;
    minutesPlanned: number;
    included: Array<{ gapSkillId: string; recommendation: Recommendation }>;
    deferred: Array<{ gapSkillId: string; gapSkillName: string; reason: string }>;
  };
};



// The client never learns the right answer, so it sends the option index and
// the server decides correctness.

export function DiagnosticFlow({
  targetRoleId,
  roleTitle,
  weeklyHours,
  canPersist
}: {
  targetRoleId: string;
  roleTitle: string;
  weeklyHours: number;
  canPersist: boolean;
}) {
  // The role was chosen at onboarding. Asking again made that choice a
  // suggestion and threw the answer away; the diagnostic just starts.
  const roleId = targetRoleId;
  const [question, setQuestion] = useState<Question | null>(null);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [askedPrompts, setAskedPrompts] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [progress, setProgress] = useState({ answered: 0, max: 15 });
  const [result, setResult] = useState<Roadmap | null>(null);
  const [mastery, setMastery] = useState<Record<string, number>>({});
  const [previousMastery, setPreviousMastery] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function advance(nextRoleId: string, nextAnswers: Answer[], nextAsked: string[]) {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRoleId: nextRoleId,
          answers: nextAnswers,
          askedPrompts: nextAsked,
          persist: canPersist
        })
      });
      if (!res.ok) throw new Error("Could not load the next question.");
      const data = await res.json();
      setProgress(data.progress);

      if (!data.done) {
        setQuestion(data.question);
        setToken(data.token);
        setAskedPrompts([...nextAsked, data.question.prompt]);
        return;
      }

      const roadmapRes = await fetch("/api/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRoleId: nextRoleId,
          mastery: data.mastery
        })
      });
      if (!roadmapRes.ok) throw new Error("Could not build the roadmap.");

      setQuestion(null);
      setMastery(data.mastery);
      setPreviousMastery(data.previousMastery ?? {});
      setResult(await roadmapRes.json());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // Ref guard rather than a started flag: an effect that sets state it also
  // depends on re-runs, and React invokes effects twice in development.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void advance(roleId, [], []);
  }, []);

  function answer(selectedIndex: number) {
    if (!question || !roleId) return;
    const next = [...answers, { questionId: question.id, selectedIndex, token }];
    setAnswers(next);
    void advance(roleId, next, askedPrompts);
  }

  function restart() {
    setQuestion(null);
    setToken(undefined);
    setAskedPrompts([]);
    setAnswers([]);
    setResult(null);
    setError(null);
    void advance(roleId, [], []);
  }

  return (
    <main className="min-h-screen bg-canvas">
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <Link className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink" href="/">
            <ArrowLeft aria-hidden="true" size={16} />
            Back to dashboard
          </Link>
          <h1 className="mt-4 text-3xl font-semibold text-ink">Adaptive diagnostic</h1>
          <p className="mt-2 max-w-2xl text-base leading-7 text-muted">
            Working out where you stand for <span className="font-semibold text-ink">{roleTitle}</span>.
            Each skill starts at intermediate and branches harder or easier from your answer, so the
            estimate lands in about 15 questions rather than a fixed quiz.
          </p>
          <p className="mt-3 text-sm text-muted">
            {canPersist ? "Your results are saved to your profile." : "Results are shown but not saved."}
            <span className="px-2 text-slate-600">/</span>
            <Link className="text-teal hover:underline" href="/onboarding">
              Change target role
            </Link>
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-6 py-8">
        {error && (
          <p className="mb-6 rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        )}

        {roleId && question && (
          // key remounts the card per question so the previous pick never carries over.
          <QuestionCard busy={busy} key={question.id} onAnswer={answer} progress={progress} question={question} />
        )}

        {busy && !question && !result && (
          <p className="flex items-center gap-2 text-muted">
            <Loader2 aria-hidden="true" className="animate-spin" size={18} />
            Scoring your answers…
          </p>
        )}

        {result && roleId && (
          <Results
            mastery={mastery}
            onRestart={restart}
            previousMastery={previousMastery}
            result={result}
            roleId={roleId}
            weeklyHours={weeklyHours}
          />
        )}
      </div>
    </main>
  );
}

function WeekPlanner({
  mastery,
  roleId,
  weeklyHours
}: {
  mastery: Record<string, number>;
  roleId: string;
  weeklyHours: number;
}) {
  const [hours, setHours] = useState(weeklyHours);
  const [failedQuiz, setFailedQuiz] = useState(false);
  const [data, setData] = useState<WeeklyPlan | null>(null);
  const [busy, setBusy] = useState(false);

  async function replan(nextHours: number, nextFailedQuiz: boolean) {
    setBusy(true);
    setHours(nextHours);
    setFailedQuiz(nextFailedQuiz);

    // The first gap is what a failed quiz would realistically be about.
    const weakestSkill = Object.entries(mastery).sort((a, b) => a[1] - b[1])[0]?.[0];

    const res = await fetch("/api/replan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetRoleId: roleId,
        weeklyHours: nextHours,
        mastery,
        ...(nextFailedQuiz && weakestSkill
          ? { assessment: { skillId: weakestSkill, score: 0.4 } }
          : {})
      })
    });
    setData(res.ok ? await res.json() : null);
    setBusy(false);
  }

  return (
    <article className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-center gap-2">
        <CalendarClock aria-hidden="true" className="text-teal" size={20} />
        <h2 className="text-lg font-semibold">Plan this week</h2>
      </div>
      <p className="mt-2 text-sm text-muted">
        Change the available hours and the plan re-fits: the critical path is kept, shorter
        alternatives are substituted, and the rest is deferred with a reason.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {/* The learner's own budget leads; the others are the "what if" cases
            demo scenario 3 exercises. */}
        {[weeklyHours, ...[8, 5, 2].filter((option) => option !== weeklyHours)].map((option) => (
          <button
            className={`h-9 rounded-md border px-3 text-sm font-medium ${
              data && hours === option ? "border-teal bg-teal/5 text-teal" : "border-border hover:border-teal"
            }`}
            disabled={busy}
            key={option}
            onClick={() => void replan(option, failedQuiz)}
            type="button"
          >
            {option} hours
          </button>
        ))}
        <button
          className={`h-9 rounded-md border px-3 text-sm font-medium ${
            failedQuiz ? "border-teal bg-teal/5 text-teal" : "border-border hover:border-teal"
          }`}
          disabled={busy}
          onClick={() => void replan(hours, !failedQuiz)}
          type="button"
        >
          {failedQuiz ? "✓ " : ""}Simulate a failed quiz
        </button>
      </div>

      {busy && <p className="mt-4 text-sm text-muted">Replanning…</p>}

      {data && !busy && (
        <div className="mt-5 space-y-4">
          {data.outcome && (
            <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-4">
              <p className="text-sm font-medium text-amber-200">{data.outcome.message}</p>
              {data.outcome.remediation && (
                <p className="mt-1 text-sm text-amber-200">
                  Inserted remediation: {data.outcome.remediation.title}
                </p>
              )}
              {data.outcome.delayedSkillIds.length > 0 && (
                <p className="mt-1 text-sm text-amber-200">
                  Delayed downstream: {data.outcome.delayedSkillIds.join(", ")}
                </p>
              )}
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-ink">
              This week · {data.plan.minutesPlanned} of {data.plan.weeklyHours * 60} min planned
            </h3>
            <ul className="mt-2 space-y-2">
              {data.plan.included.map((item) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
                  key={item.gapSkillId}
                >
                  <span className="font-medium text-ink">{item.recommendation.resource.title}</span>
                  <span className="text-muted">
                    {item.gapSkillId} · {item.recommendation.explanation.estimatedTime}
                  </span>
                </li>
              ))}
              {data.plan.included.length === 0 && (
                <li className="text-sm text-muted">Nothing fits this week — even the shortest option is too long.</li>
              )}
            </ul>
          </div>

          {data.plan.deferred.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-ink">Deferred</h3>
              <ul className="mt-2 space-y-2">
                {data.plan.deferred.map((item) => (
                  <li className="rounded-md border border-dashed border-border p-3 text-sm" key={item.gapSkillId}>
                    <span className="font-medium text-ink">{item.gapSkillName}</span>
                    <span className="ml-2 text-muted">{item.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!data && !busy && (
        <button
          className="mt-4 inline-flex h-10 items-center rounded-md bg-teal px-4 text-sm font-semibold text-white hover:bg-teal-strong"
          onClick={() => void replan(hours, false)}
          type="button"
        >
          Plan my week
        </button>
      )}
    </article>
  );
}

function QuestionCard({
  busy,
  onAnswer,
  progress,
  question
}: {
  busy: boolean;
  onAnswer: (selectedIndex: number) => void;
  progress: { answered: number; max: number };
  question: Question;
}) {
  const [picked, setPicked] = useState<number | null>(null);

  return (
    <section>
      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          Question {progress.answered + 1} of at most {progress.max}
        </span>
        <span className="rounded-md bg-surface px-2 py-1 font-medium">
          {question.skillName} · {question.difficulty}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
        <div
          className="h-full bg-teal transition-all"
          style={{ width: `${(progress.answered / progress.max) * 100}%` }}
        />
      </div>

      <article className="mt-5 rounded-lg border border-border bg-surface p-6">
        {/* The question is written for this learner; saying so is the difference
            between adaptive and merely appearing static. */}
        {question.rationale && (
          <p className="mb-4 flex items-start gap-2 rounded-md border border-cyan-300/20 bg-cyan-300/5 p-3 text-sm leading-6 text-cyan-100">
            <Sparkles aria-hidden="true" className="mt-0.5 shrink-0" size={15} />
            {question.rationale}
          </p>
        )}
        <h2 className="text-xl font-semibold text-ink">{question.prompt}</h2>
        <div className="mt-5 space-y-3">
          {question.options.map((option, index) => (
            <button
              className={`w-full rounded-md border p-4 text-left text-sm transition-colors ${
                picked === index ? "border-teal bg-teal/5 text-teal" : "border-border hover:border-teal"
              }`}
              disabled={busy}
              key={option}
              onClick={() => setPicked(index)}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>

        {/* Grading happens server-side — the page never receives the answer key. */}
        <div className="mt-6 flex items-center gap-3 border-t border-border pt-5">
          <button
            className="inline-flex h-10 items-center rounded-md bg-teal px-4 text-sm font-semibold text-white hover:bg-teal-strong disabled:opacity-50"
            disabled={busy || picked === null}
            onClick={() => picked !== null && onAnswer(picked)}
            type="button"
          >
            {busy ? "Checking…" : "Submit answer"}
          </button>
          <button
            className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-50"
            disabled={busy}
            onClick={() => onAnswer(-1)}
            type="button"
          >
            Skip — I don&apos;t know
          </button>
        </div>
      </article>
    </section>
  );
}

/** What changed since the last diagnostic. Rendered only on a repeat run. */
function DeltaPanel({
  delta,
  skillName
}: {
  delta: DiagnosticDelta;
  skillName: (skillId: string) => string;
}) {
  const moved = delta.improved.length + delta.declined.length + delta.newlyAssessed.length;

  return (
    <article className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-center gap-2">
        <TrendingUp aria-hidden="true" className="text-teal" size={20} />
        <h2 className="text-lg font-semibold">Since your last diagnostic</h2>
      </div>

      {moved === 0 ? (
        // Saying so is the point: a rerun that changed nothing is a result, and
        // hiding it is what made the second run feel pointless.
        <p className="mt-3 text-sm leading-6 text-muted">
          Nothing moved — the same {delta.unchangedCount} skill
          {delta.unchangedCount === 1 ? "" : "s"} landed on the same estimate. Finishing a resource
          and passing its check is what shifts these.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {[
            ...delta.improved.map((m) => ({ m, tone: "text-emerald-200", sign: "+" })),
            ...delta.declined.map((m) => ({ m, tone: "text-amber-200", sign: "" }))
          ].map(({ m, tone, sign }) => (
            <li
              className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
              key={m.skillId}
            >
              <span className="font-medium text-ink">{skillName(m.skillId)}</span>
              <span className={`shrink-0 tabular-nums ${tone}`}>
                {Math.round((m.before ?? 0) * 100)}% → {Math.round(m.after * 100)}% ({sign}
                {Math.round(m.change * 100)})
              </span>
            </li>
          ))}
          {delta.newlyAssessed.map((m) => (
            <li
              className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border p-3 text-sm"
              key={m.skillId}
            >
              <span className="font-medium text-ink">{skillName(m.skillId)}</span>
              <span className="shrink-0 tabular-nums text-muted">
                first measured · {Math.round(m.after * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}

      {moved > 0 && delta.unchangedCount > 0 && (
        <p className="mt-3 text-xs text-muted">
          {delta.unchangedCount} other skill{delta.unchangedCount === 1 ? "" : "s"} landed on the same
          estimate.
        </p>
      )}
    </article>
  );
}

function Results({
  mastery,
  onRestart,
  previousMastery,
  result,
  roleId,
  weeklyHours
}: {
  mastery: Record<string, number>;
  onRestart: () => void;
  previousMastery: Record<string, number>;
  result: Roadmap;
  roleId: string;
  weeklyHours: number;
}) {
  const { roadmap, recommendations } = result;
  const delta = summariseDelta(previousMastery, mastery);
  const skillName = (skillId: string) =>
    [...roadmap.gaps.map((gap) => gap.skill), ...roadmap.mastered.map((item) => item.skill)].find(
      (skill) => skill.id === skillId
    )?.name ?? skillId;

  return (
    <section className="space-y-6">
      {!delta.firstRun && <DeltaPanel delta={delta} skillName={skillName} />}
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink">{roadmap.role.title} readiness</h2>
          <p className="mt-1 text-sm text-muted">
            {roadmap.mastered.length} skill{roadmap.mastered.length === 1 ? "" : "s"} already evidenced ·{" "}
            {roadmap.gaps.length} to close
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ShieldCheck aria-hidden="true" className="text-teal" size={30} />
          <span className="text-3xl font-semibold">{Math.round(roadmap.readiness * 100)}%</span>
        </div>
      </div>

      <article className="rounded-lg border border-border bg-surface p-6">
        <div className="flex items-center gap-2">
          <Route aria-hidden="true" className="text-teal" size={20} />
          <h2 className="text-lg font-semibold">Prerequisite-valid order</h2>
        </div>
        <ol className="mt-4 space-y-3">
          {roadmap.gaps.map((gap, index) => (
            <li className="flex gap-3 rounded-md border border-border p-4" key={gap.skill.id}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-canvas text-xs font-semibold">
                {index + 1}
              </span>
              <div>
                <h3 className="font-semibold">{gap.skill.name}</h3>
                <GapReason
                  blockedBy={gap.blockedBy}
                  currentMastery={gap.currentMastery}
                  reason={gap.reason}
                  skillName={gap.skill.name}
                  unlocks={gap.unlocks}
                />
              </div>
              <span className="ml-auto shrink-0 self-start rounded-md bg-canvas px-2 py-1 text-sm font-medium">
                {Math.round(gap.currentMastery * 100)}%
              </span>
            </li>
          ))}
        </ol>
      </article>

      <article className="rounded-lg border border-border bg-surface p-6">
        <div className="flex items-center gap-2">
          <CheckCircle2 aria-hidden="true" className="text-teal" size={20} />
          <h2 className="text-lg font-semibold">Why recommended</h2>
        </div>
        {recommendations.length === 0 && (
          <p className="mt-4 text-sm text-muted">
            No resource clears the prerequisite gate for your top gap yet — close an earlier skill first.
          </p>
        )}
        {recommendations.slice(0, 3).map((item) => (
          <div className="mt-5 border-t border-border pt-5 first:border-t-0 first:pt-0" key={item.resource.id}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold">{item.resource.title}</h3>
                <p className="mt-1 text-sm text-muted">
                  {item.resource.provider} · {item.explanation.estimatedTime} · {item.resource.costType} ·
                  produces {item.explanation.evidenceArtifact}
                </p>
              </div>
              <a
                className="inline-flex h-10 shrink-0 items-center rounded-md bg-teal px-4 text-sm font-semibold text-white hover:bg-teal-strong"
                href={item.resource.url}
                rel="noreferrer"
                target="_blank"
              >
                Open
              </a>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">{item.explanation.whatGapItCloses}</p>
            <div className="mt-4">
              <ScoreBreakdown score={item.score} />
            </div>
            <CompleteResource resourceId={item.resource.id} />
          </div>
        ))}
      </article>

      <WeekPlanner mastery={mastery} roleId={roleId} weeklyHours={weeklyHours} />

      {/* The screen where a learner is most likely to have a question is the one
          that just told them what they do not know. */}
      <MentorPanel />

      <button
        className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-semibold hover:border-teal"
        onClick={onRestart}
        type="button"
      >
        Run another diagnostic
      </button>
    </section>
  );
}
