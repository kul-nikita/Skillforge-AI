"use client";

import { useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { button, card, input } from "@/lib/ui";

type Turn = { question: string; answer: string; source: string };

const SUGGESTIONS = [
  "What should I do today?",
  "Why is that skill blocked?",
  "How far off am I?"
];

/**
 * Answers questions about the learner's own roadmap. The server builds the fact
 * pack from their stored state and checks the reply against it, so this can
 * explain the plan but cannot invent one — if the answer is not in the facts it
 * says so rather than guessing.
 */
export function MentorPanel() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(text: string) {
    const asked = text.trim();
    if (asked.length < 3 || busy) {
      return;
    }

    setBusy(true);
    setError(null);
    setQuestion("");

    try {
      const res = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: asked })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not answer that right now.");
        return;
      }

      setTurns((previous) => [...previous, { question: asked, answer: data.text, source: data.source }]);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${card} p-5`}>
      <div className="flex items-center gap-2">
        <MessageCircle aria-hidden="true" className="text-cyan-300" size={16} />
        <h2 className="text-sm font-semibold tracking-tight text-ink">Ask about your path</h2>
      </div>

      <p className="mt-1 text-sm leading-6 text-muted">
        Answers come from your own roadmap and progress — nothing else.
      </p>

      {turns.length > 0 && (
        <ol className="mt-4 space-y-4">
          {turns.map((turn, index) => (
            <li key={index}>
              <p className="text-sm font-medium text-ink">{turn.question}</p>
              <p className="mt-1 text-sm leading-6 text-muted">{turn.answer}</p>
              {turn.source === "fallback" && (
                <p className="mt-1 text-xs text-muted/70">Answered from your data without the model.</p>
              )}
            </li>
          ))}
        </ol>
      )}

      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
      >
        <label className="sr-only" htmlFor="mentor-question">
          Your question
        </label>
        <input
          className={input}
          id="mentor-question"
          maxLength={500}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="What should I do today?"
          value={question}
        />
        <button className={button.secondary} disabled={busy} type="submit">
          {busy ? <Loader2 aria-hidden="true" className="animate-spin" size={15} /> : "Ask"}
        </button>
      </form>

      {turns.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              className="rounded-full border border-border px-3 py-1 text-xs text-muted transition-colors hover:border-white/25 hover:text-ink"
              key={suggestion}
              onClick={() => void ask(suggestion)}
              type="button"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
    </section>
  );
}
