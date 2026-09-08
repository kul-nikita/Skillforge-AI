"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Domain, Role } from "@/lib/types";
import { ManualSetup } from "@/components/ManualSetup";
import { describeFit } from "@/lib/planner/onboarding-fit";
import { button, card, eyebrow, input, label } from "@/lib/ui";

type Intent = {
  targetRoleId: string;
  timelineWeeks: number;
  weeklyHours: number;
  preferences: { maxHoursPerStep: number; cost: string; format: string };
};

const EXAMPLE_LABELS = ["Career switch", "Going deeper", "From spreadsheets", "Already in IT"];

const EXAMPLES = [
  "I'm a second-year student who knows some Python and networking. I want to be internship-ready as a junior SOC analyst in 12 weeks.",
  "I can give about 5 hours a week and prefer hands-on labs. I want to move into penetration testing over the next 6 months.",
  "I use spreadsheets daily and want to become a data analyst in about 4 months. Free resources, roughly 6 hours a week.",
  "I already work in IT support and want to move into cloud security. Free resources only, a couple of hours a week."
];

type Reply = { question: string; answer: string };

/** A guess presented as understanding is a small lie, so the guesses are named. */
const ASSUMED_LABELS: Record<string, string> = {
  targetRoleId: "which role you're aiming at",
  timelineWeeks: "how long you have",
  weeklyHours: "how many hours a week",
  experienceLevel: "your experience level",
  learningStyle: "how you like to learn",
  preferences: "your resource preferences",
  currentSkills: "what you already know",
  interests: "your interests",
  preferredTechnologies: "the tools you prefer",
  learningHistory: "your learning history",
  careerObjective: "your objective"
};

/** "a, b and c" — a bare join left the sentence reading "a, b, so these are…". */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const FIT_TONE: Record<string, string> = {
  comfortable: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  workable: "border-cyan-300/25 bg-cyan-300/10 text-cyan-200",
  tight: "border-amber-400/30 bg-amber-400/10 text-amber-200"
};

/**
 * Named rather than numbered: the middle step only exists when the model had to
 * guess something critical, and "step 1 of 3" that jumps to 3 reads as a bug.
 */
function Steps({ current, withFollowUp }: { current: string; withFollowUp: boolean }) {
  const steps = ["Your goal", ...(withFollowUp ? ["A quick check"] : []), "Review"];

  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {steps.map((step, index) => (
        <li className="flex items-center gap-2" key={step}>
          {index > 0 && <span aria-hidden="true" className="text-slate-600">/</span>}
          <span
            aria-current={step === current ? "step" : undefined}
            className={step === current ? "font-semibold text-ink" : "text-muted"}
          >
            {step}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Heading({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="mt-3 text-base leading-7 text-muted">{children}</p>
    </>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300"
      role="alert"
    >
      {message}
    </p>
  );
}

export function OnboardingFlow({ domains, roles }: { domains: Domain[]; roles: Role[] }) {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [replies, setReplies] = useState<Reply[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [assumed, setAssumed] = useState<string[]>([]);
  const [manual, setManual] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * One turn of the conversation. The whole transcript goes back every time, so
   * an answer to a follow-up adds to what was already said rather than
   * replacing it.
   */
  async function send(nextReplies: Reply[]) {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, replies: nextReplies })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not read that goal.");
        // Without a working model there is no other way to a profile, so offer
        // the direct route rather than stranding the learner on step one.
        if (data.modelUnavailable) {
          setManual(true);
        }
        return;
      }

      if (data.done) {
        setIntent(data.intent);
        setAssumed(data.assumed ?? []);
        setQuestion(null);
      } else {
        setQuestion(data.question);
        setAnswer("");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  function parseGoal(event: React.FormEvent) {
    event.preventDefault();
    setReplies([]);
    void send([]);
  }

  function sendAnswer(event: React.FormEvent) {
    event.preventDefault();
    if (!question || answer.trim().length === 0) return;

    const next = [...replies, { question, answer: answer.trim() }];
    setReplies(next);
    void send(next);
  }

  /** Back to the blank goal box from anywhere, without a reload. */
  function restart() {
    setIntent(null);
    setQuestion(null);
    setReplies([]);
    setAnswer("");
    setAssumed([]);
    setError(null);
  }

  async function confirm() {
    if (!intent) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...intent, consentGiven: consent })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not save your plan.");
        return;
      }

      router.push("/diagnostic");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (manual) {
    return (
      <ManualSetup
        onBack={() => {
          setManual(false);
          setError(null);
        }}
        roles={roles}
      />
    );
  }

  if (question) {
    return (
      <>
        <Steps current="A quick check" withFollowUp />
        <Heading title="One quick thing">
          This shapes the whole roadmap, so it&apos;s worth asking rather than guessing.
        </Heading>

        <section className="mt-8 space-y-5">
          <ol className="space-y-4">
            <li>
              <p className={eyebrow}>You said</p>
              <p className="mt-1 text-sm leading-6 text-ink">{goal}</p>
            </li>
            {replies.map((reply) => (
              <li key={reply.question}>
                <p className={eyebrow}>{reply.question}</p>
                <p className="mt-1 text-sm leading-6 text-ink">{reply.answer}</p>
              </li>
            ))}
          </ol>

          <form className="space-y-3 border-t border-border pt-5" onSubmit={sendAnswer}>
            <label className="block text-base font-semibold tracking-tight text-ink" htmlFor="follow-up">
              {question}
            </label>
            <input
              autoFocus
              className={input}
              id="follow-up"
              maxLength={500}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="In your own words…"
              value={answer}
            />

            {error && <ErrorNote message={error} />}

            <div className="flex flex-wrap gap-3">
              <button className={button.primary} disabled={busy || answer.trim().length === 0} type="submit">
                {busy ? "Thinking…" : "Continue"}
              </button>
              <button className={button.ghost} disabled={busy} onClick={() => void send(replies)} type="button">
                Skip this
              </button>
              {/* An unanswerable question used to be a dead end short of a reload. */}
              <button className={button.ghost} disabled={busy} onClick={restart} type="button">
                Rewrite my goal
              </button>
            </div>
          </form>
        </section>
      </>
    );
  }

  if (!intent) {
    return (
      <>
        <Steps current="Your goal" withFollowUp={false} />
        <Heading title="What are you aiming for?">
          Describe it in your own words — a sentence is enough. If something important is missing
          we&apos;ll ask, rather than guess, and you see exactly what we understood before anything is
          saved.
        </Heading>

        <form className="mt-8 space-y-4" onSubmit={parseGoal}>
          <textarea
            className={`${input} h-36`}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. I want to become a junior SOC analyst in 12 weeks, about 8 hours a week, free hands-on labs."
            required
            value={goal}
          />

          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example, index) => (
              <button
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-muted hover:border-teal hover:text-ink"
                key={example}
                onClick={() => setGoal(example)}
                type="button"
              >
                {EXAMPLE_LABELS[index]}
              </button>
            ))}
          </div>

          {error && <ErrorNote message={error} />}

          <div className="flex flex-wrap items-center gap-3">
            <button className={button.primary} disabled={busy || goal.trim().length < 3} type="submit">
              {busy ? "Reading your goal…" : "Continue"}
            </button>
            <button className={button.ghost} onClick={() => setManual(true)} type="button">
              Or pick a role directly
            </button>
          </div>
        </form>
      </>
    );
  }

  const role = roles.find((candidate) => candidate.id === intent.targetRoleId);
  // `listRoles()` already carries requiredSkills, so the fit recomputes on every
  // keystroke without a round-trip.
  const fit = describeFit({
    requiredSkillCount: role?.requiredSkills.length ?? 0,
    timelineWeeks: intent.timelineWeeks,
    weeklyHours: intent.weeklyHours
  });

  const rolesByDomain = domains
    .map((domain) => ({ domain, options: roles.filter((r) => r.domainId === domain.id) }))
    .filter((group) => group.options.length > 0);

  return (
    <>
      <Steps current="Review" withFollowUp={replies.length > 0} />
      <Heading title="Here's what we understood">
        Change anything that&apos;s wrong. Nothing is saved until you confirm.
      </Heading>

      <section className="mt-8 space-y-5">
        <div className={`${card} p-6`}>
          {assumed.length > 0 && (
            <p className="mb-5 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
              You didn&apos;t mention{" "}
              {joinList(assumed.map((field) => ASSUMED_LABELS[field] ?? field))}, so{" "}
              {assumed.length === 1 ? "that's our best guess" : "these are our best guesses"}. Worth a
              look before you continue.
            </p>
          )}

          <div className="space-y-4">
            <div>
              <label className={label} htmlFor="target-role">
                Target role
              </label>
              <select
                className={input}
                id="target-role"
                onChange={(e) => setIntent({ ...intent, targetRoleId: e.target.value })}
                value={intent.targetRoleId}
              >
                {rolesByDomain.map(({ domain, options }) => (
                  <optgroup key={domain.id} label={domain.name}>
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {role && <span className="mt-1.5 block text-xs leading-5 text-muted">{role.description}</span>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="timeline-weeks">
                  Timeline (weeks)
                </label>
                <input
                  className={input}
                  id="timeline-weeks"
                  max={52}
                  min={1}
                  onChange={(e) => setIntent({ ...intent, timelineWeeks: Number(e.target.value) })}
                  type="number"
                  value={intent.timelineWeeks}
                />
              </div>
              <div>
                <label className={label} htmlFor="weekly-hours">
                  Hours per week
                </label>
                <input
                  className={input}
                  id="weekly-hours"
                  max={60}
                  min={1}
                  onChange={(e) => setIntent({ ...intent, weeklyHours: Number(e.target.value) })}
                  type="number"
                  value={intent.weeklyHours}
                />
              </div>
              <div>
                <label className={label} htmlFor="session-length">
                  Longest single session (hours)
                </label>
                <input
                  className={input}
                  id="session-length"
                  max={20}
                  min={0.5}
                  onChange={(e) =>
                    setIntent({
                      ...intent,
                      preferences: { ...intent.preferences, maxHoursPerStep: Number(e.target.value) }
                    })
                  }
                  step={0.5}
                  type="number"
                  value={intent.preferences.maxHoursPerStep}
                />
              </div>
              <div>
                <label className={label} htmlFor="format">
                  Preferred format
                </label>
                <select
                  className={input}
                  id="format"
                  onChange={(e) =>
                    setIntent({ ...intent, preferences: { ...intent.preferences, format: e.target.value } })
                  }
                  value={intent.preferences.format}
                >
                  {["any", "lab", "course", "doc", "project", "video"].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="budget">
                  Budget
                </label>
                <select
                  className={input}
                  id="budget"
                  onChange={(e) =>
                    setIntent({ ...intent, preferences: { ...intent.preferences, cost: e.target.value } })
                  }
                  value={intent.preferences.cost}
                >
                  {["free", "freemium", "paid", "any"].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* What the numbers above actually commit the learner to. Arithmetic on
            the role's own skill count — no model call, no fabricated hours. */}
        <div className={`rounded-lg border p-5 ${FIT_TONE[fit.verdict]}`} aria-live="polite">
          <p className="text-sm font-semibold">What that means</p>
          <p className="mt-2 text-sm leading-6">
            {role?.title ?? "This role"} needs{" "}
            <span className="font-semibold tabular-nums">{role?.requiredSkills.length ?? 0} skills</span>. At{" "}
            <span className="font-semibold tabular-nums">{intent.weeklyHours}h</span> a week for{" "}
            <span className="font-semibold tabular-nums">{intent.timelineWeeks} weeks</span> you have{" "}
            <span className="font-semibold tabular-nums">{fit.totalHours} hours</span> in total.
          </p>
          <p className="mt-1.5 text-sm leading-6 opacity-90">{fit.note}</p>
        </div>

        <div className={`${card} p-6`}>
          <label className="flex gap-3">
            <input
              checked={consent}
              className="mt-1 h-4 w-4 shrink-0"
              onChange={(e) => setConsent(e.target.checked)}
              type="checkbox"
            />
            <span className="text-sm leading-6 text-muted">
              <span className="font-medium text-ink">Store and analyze my progress.</span> Your
              diagnostic answers and completed work are used to estimate your skills and adapt your
              plan. You can export or delete everything at any time.
            </span>
          </label>

          {/* The box is off by default and the cost of leaving it off is a whole
              diagnostic answered and discarded, so say so here, not in the small print. */}
          {!consent && (
            <p className="mt-4 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm leading-6 text-amber-200">
              Leaving this off means your diagnostic answers aren&apos;t saved: you&apos;ll see your
              results on screen, but readiness stays at 0% and the roadmap can&apos;t adapt as you go.
            </p>
          )}
        </div>

        {error && <ErrorNote message={error} />}

        <div className="flex flex-wrap gap-3">
          <button className={button.primary} disabled={busy} onClick={confirm} type="button">
            {busy ? "Saving…" : consent ? "Confirm and start diagnostic" : "Continue without saving results"}
          </button>
          <button className={button.secondary} disabled={busy} onClick={restart} type="button">
            Rewrite my goal
          </button>
        </div>
      </section>
    </>
  );
}
