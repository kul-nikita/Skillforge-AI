"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { button } from "@/lib/ui";
import type { JourneyStage } from "@/lib/services/journey";

const STEP_LABELS = ["Goal", "Level", "Learn", "Prove"];

/**
 * The answer to "what am I supposed to do now", on every signed-in page.
 *
 * A newcomer could previously reach the dashboard with no goal, no diagnostic
 * and no idea that one had to come before the other. The stage is computed on
 * the server from what the learner has actually done; the coaching sentence is
 * fetched after paint so a model call never delays the page.
 */
export function JourneyStrip({ stage }: { stage: JourneyStage }) {
  const [note, setNote] = useState<{ text: string; source: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.text) setNote({ text: data.text, source: data.source });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [stage.id]);

  return (
    <section
      aria-label="Your progress"
      className="border-b border-border bg-surface-sunken"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <ol className="flex items-center gap-1.5" aria-label={`Step ${stage.step} of ${stage.total}`}>
            {STEP_LABELS.map((labelText, index) => {
              const position = index + 1;
              const done = position < stage.step || stage.complete;
              const active = position === stage.step && !stage.complete;

              return (
                <li key={labelText} className="flex items-center gap-1.5">
                  <span
                    className={
                      done
                        ? "flex items-center gap-1 text-xs font-medium text-cyan-300"
                        : active
                          ? "text-xs font-semibold text-ink"
                          : "text-xs text-muted"
                    }
                  >
                    {done && <Check aria-hidden="true" size={12} />}
                    {labelText}
                  </span>
                  {index < STEP_LABELS.length - 1 && (
                    <span aria-hidden="true" className="h-px w-6 bg-border" />
                  )}
                </li>
              );
            })}
          </ol>

          <p className="mt-2 text-base font-semibold tracking-tight text-ink">{stage.title}</p>

          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            {note?.text ?? stage.why}
          </p>
        </div>

        <Link className={`${button.primary} shrink-0`} href={stage.cta.href}>
          {stage.cta.label}
          <ArrowRight aria-hidden="true" size={15} />
        </Link>
      </div>
    </section>
  );
}
