import Link from "next/link";
import { button } from "@/lib/ui";

const STEPS = [
  {
    title: "Say what you're aiming at",
    body: "One or two sentences in your own words. We map it to a real role in the skill graph — no dropdown archaeology."
  },
  {
    title: "Take a short diagnostic",
    body: "Around a dozen adaptive questions. It finds the level you're actually at, so the plan isn't built on a guess."
  },
  {
    title: "Work the path in order",
    body: "Nothing is recommended before what it depends on. Every suggestion says what gap it closes and what it unlocks."
  },
  {
    title: "Turn steps into proof",
    body: "Finish something, pass the check on it, and it becomes a signed record you can hand to someone."
  }
];

/**
 * What a learner sees before they have a goal. Previously this state rendered
 * the alphabetically-first role's dashboard as though it were theirs, so the
 * first thing a new account saw was a plan it had never asked for.
 */
export function FirstRun({ hasRoles }: { hasRoles: boolean }) {
  if (!hasRoles) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20">
        <h1 className="font-display text-2xl font-semibold tracking-tight">No roles are seeded yet</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Run <code className="rounded bg-surface px-1.5 py-0.5 text-ink">npm run db:seed:all</code> to
          load the skill graph and catalog, then reload this page.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
        Let&apos;s find out what you should learn next.
      </h1>

      <p className="mt-4 max-w-xl text-base leading-7 text-muted">
        Four steps, about fifteen minutes, and you&apos;ll have a roadmap ordered by real prerequisites
        instead of a reading list.
      </p>

      <ol className="mt-10 space-y-px overflow-hidden rounded-lg border border-border">
        {STEPS.map((step, index) => (
          <li className="flex gap-4 bg-surface p-5" key={step.title}>
            <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full border border-border text-center text-xs font-semibold leading-6 text-muted tabular-nums">
              {index + 1}
            </span>
            <div>
              <h2 className="text-sm font-semibold text-ink">{step.title}</h2>
              <p className="mt-1 text-sm leading-6 text-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-8">
        <Link className={button.primary} href="/onboarding">
          Start with your goal
        </Link>
      </div>
    </div>
  );
}
