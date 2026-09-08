"use client";

import { useState } from "react";
import { Lock, Search } from "lucide-react";

type Result = {
  resource: { id: string; title: string; provider: string; url: string; durationMinutes: number };
  similarity: number;
  ready: boolean;
  unmetPrerequisites: string[];
  teaches: string[];
};

export function ResourceSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 6 })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Search failed.");
        return;
      }
      setResults(data.results);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-lg border border-white/10 bg-surface/95 p-5 shadow-card">
      <div className="flex items-center gap-2">
        <Search aria-hidden="true" className="text-teal" size={20} />
        <h2 className="text-lg font-semibold">Find something specific</h2>
      </div>
      <p className="mt-2 text-sm text-muted">
        Describe it in your own words — you don&apos;t need to know the skill name. Anything your
        prerequisites don&apos;t cover yet is shown, but marked locked.
      </p>

      <form className="mt-4 flex gap-2" onSubmit={run}>
        <input
          className="h-10 flex-1 rounded-md border border-border bg-surface-sunken px-3 text-sm text-ink placeholder:text-muted/70 focus:border-teal-soft focus:outline-none"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. catching phishing emails"
          value={query}
        />
        <button
          className="inline-flex h-10 shrink-0 items-center rounded-md bg-teal px-4 text-sm font-semibold text-white hover:bg-teal-strong disabled:opacity-50"
          disabled={busy || query.trim().length < 3}
          type="submit"
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </form>

      {error && (
        <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      {results?.length === 0 && <p className="mt-4 text-sm text-muted">Nothing matched that.</p>}

      {results && results.length > 0 && (
        <ul className="mt-4 space-y-3">
          {results.map((item) => (
            <li className="rounded-md border border-border p-3" key={item.resource.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-ink">{item.resource.title}</h3>
                  <p className="mt-0.5 text-xs text-muted">
                    {item.resource.provider} · teaches {item.teaches.join(", ") || "—"}
                  </p>
                </div>
                {item.ready ? (
                  <a
                    className="inline-flex h-8 shrink-0 items-center rounded-md bg-teal px-3 text-xs font-semibold text-white hover:bg-teal-strong"
                    href={item.resource.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open
                  </a>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-canvas px-2 py-1 text-xs text-muted">
                    <Lock aria-hidden="true" size={12} />
                    Locked
                  </span>
                )}
              </div>
              {!item.ready && (
                <p className="mt-2 text-xs text-muted">
                  Build these first: {item.unmetPrerequisites.join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
