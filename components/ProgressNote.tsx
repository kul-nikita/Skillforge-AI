"use client";

import { useEffect, useState } from "react";
import { Sparkle } from "lucide-react";

/**
 * What actually moved, after a graded completion or interview.
 *
 * The server reads the result from the event log rather than taking it from the
 * client, so this narrates what was really recorded. Renders nothing until it
 * has something to say — a completion panel should not sit there with an empty
 * box waiting on a model.
 */
export function ProgressNote() {
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ narrate: true })
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.text) setNote(data.text);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  if (!note) {
    return null;
  }

  return (
    <p className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-sm leading-6 text-muted">
      <Sparkle aria-hidden="true" className="mt-1 shrink-0 text-cyan-300" size={14} />
      <span>{note}</span>
    </p>
  );
}
