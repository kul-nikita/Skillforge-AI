"use client";

import { useState } from "react";
import { Search, Check, AlertTriangle, X, Loader2 } from "lucide-react";

type MatchedSkill = {
  parsedSkill: {
    name: string;
    required: boolean;
    confidence: number;
    originalText: string;
  };
  graphSkill: {
    id: string;
    name: string;
    category: string;
  };
  mastery: number;
  status: "mastered" | "partial" | "missing";
  isRequired: boolean;
};

type GapAnalysisResult = {
  jobTitle: string;
  company: string | null;
  skills: Array<{
    name: string;
    required: boolean;
    confidence: number;
    originalText: string;
  }>;
  gapAnalysis: {
    matched: MatchedSkill[];
    unmatched: Array<{
      name: string;
      required: boolean;
      confidence: number;
      originalText: string;
    }>;
    overallMatch: number;
    requiredMatch: number;
  };
  role: {
    id: string;
    title: string;
  };
};

const STATUS_CONFIG = {
  mastered: { color: "text-emerald-300 bg-emerald-500/10", icon: Check, label: "Mastered" },
  partial: { color: "text-amber-300 bg-amber-500/10", icon: AlertTriangle, label: "Partial" },
  missing: { color: "text-red-300 bg-red-500/10", icon: X, label: "Missing" }
};

export function GapAnalysis() {
  const [jdText, setJdText] = useState("");
  const [result, setResult] = useState<GapAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    if (!jdText.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/jd/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jdText })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = typeof body.error === "string" ? body.error : `Request failed: ${res.status}`;
        throw new Error(msg);
      }

      const data = await res.json();
      if (!data.gapAnalysis) {
        throw new Error("No target role set — complete onboarding first.");
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Input */}
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-ink">Paste a Job Description</h2>
        <p className="mt-1 text-sm text-muted">
          We&apos;ll extract the required skills and show how you match against them.
        </p>
        <textarea
          className="mt-4 w-full rounded-md border border-border bg-canvas p-3 text-sm text-ink placeholder:text-muted focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
          rows={8}
          placeholder="Paste the job description here..."
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
        />
        <button
          onClick={analyze}
          disabled={loading || !jdText.trim()}
          type="button"
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-strong disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Search size={16} />
              Analyze Job Description
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Job Header */}
          <div className="rounded-lg border border-border bg-surface p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-ink">{result.jobTitle}</h2>
                {result.company && (
                  <p className="mt-1 text-sm text-muted">{result.company}</p>
                )}
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-ink">
                  {Math.round(result.gapAnalysis.overallMatch * 100)}%
                </div>
                <div className="text-xs uppercase tracking-wide text-muted">
                  overall match
                </div>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted">
              Matched against role: <span className="font-medium text-ink">{result.role.title}</span>
            </p>
          </div>

          {/* Matched Skills */}
          <div className="rounded-lg border border-border bg-surface p-6">
            <h3 className="text-lg font-semibold text-ink">
              Matched Skills ({result.gapAnalysis.matched.length})
            </h3>
            <div className="mt-4 space-y-3">
              {result.gapAnalysis.matched
                .sort((a, b) => {
                  const statusOrder = { missing: 0, partial: 1, mastered: 2 };
                  return statusOrder[a.status] - statusOrder[b.status];
                })
                .map((match) => {
                  const config = STATUS_CONFIG[match.status];
                  const Icon = config.icon;
                  return (
                    <div
                      key={match.graphSkill.id}
                      className="flex items-center justify-between gap-4 rounded-md border border-border p-4"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${config.color}`}>
                          <Icon size={12} />
                          {config.label}
                        </span>
                        <div>
                          <div className="font-medium text-ink">{match.graphSkill.name}</div>
                          <div className="text-xs text-muted">
                            {match.parsedSkill.required ? "Required" : "Nice to have"} ·{" "}
                            {Math.round(match.parsedSkill.confidence * 100)}% confidence
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-ink">
                          {Math.round(match.mastery * 100)}%
                        </div>
                        <div className="text-xs text-muted">your mastery</div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Unmatched Skills */}
          {result.gapAnalysis.unmatched.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-6">
              <h3 className="text-lg font-semibold text-ink">
                Skills Not in Your Learning Path ({result.gapAnalysis.unmatched.length})
              </h3>
              <p className="mt-1 text-sm text-muted">
                These skills were found in the JD but don&apos;t appear in your target role&apos;s skill graph.
              </p>
              <div className="mt-4 space-y-2">
                {result.gapAnalysis.unmatched.map((skill) => (
                  <div
                    key={skill.name}
                    className="flex items-center justify-between rounded-md border border-border p-3"
                  >
                    <span className="text-sm text-ink">{skill.name}</span>
                    <span className="text-xs text-muted">
                      {skill.required ? "Required" : "Nice to have"} ·{" "}
                      {Math.round(skill.confidence * 100)}% confidence
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing Skills - Action Items */}
          {result.gapAnalysis.matched.some((m) => m.status === "missing") && (
            <div className="rounded-lg border border-teal bg-teal/5 p-6">
              <h3 className="text-lg font-semibold text-ink">Priority Actions</h3>
              <p className="mt-1 text-sm text-muted">
                Focus on these missing skills to improve your match:
              </p>
              <ul className="mt-4 space-y-2">
                {result.gapAnalysis.matched
                  .filter((m) => m.status === "missing")
                  .map((match) => (
                    <li className="flex gap-2 text-sm text-ink" key={match.graphSkill.id}>
                      <X size={14} className="mt-0.5 shrink-0 text-red-500" />
                      <span>
                        <span className="font-medium">{match.graphSkill.name}</span>
                        {match.parsedSkill.originalText !== match.graphSkill.name && (
                          <span className="text-muted">
                            {" "}— mentioned as &ldquo;{match.parsedSkill.originalText}&rdquo;
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
