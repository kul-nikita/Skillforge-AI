"use client";

import { useState } from "react";
import { Target, Check, AlertTriangle, X, Loader2 } from "lucide-react";

type MatchResult = {
  jobTitle: string;
  company: string | null;
  matchScore: {
    overall: number;
    perSkill: Array<{
      skillId: string;
      skillName: string;
      mastery: number;
      importance: number;
      status: "mastered" | "partial" | "missing";
    }>;
  };
};

const STATUS_CONFIG = {
  mastered: { color: "text-emerald-300", bg: "bg-emerald-500", icon: Check },
  partial: { color: "text-amber-300", bg: "bg-amber-500", icon: AlertTriangle },
  missing: { color: "text-red-300", bg: "bg-red-500", icon: X }
};

export function MatchScoreCard() {
  const [jdText, setJdText] = useState("");
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    if (!jdText.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const parseRes = await fetch("/api/jd/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jdText })
      });

      if (!parseRes.ok) {
        const body = await parseRes.json().catch(() => ({}));
        const msg = typeof body.error === "string" ? body.error : `Request failed: ${parseRes.status}`;
        throw new Error(msg);
      }

      const parseData = await parseRes.json();

      // The role comes from the session profile, server-side.
      const matchRes = await fetch("/api/match-score", { method: "POST" });

      if (!matchRes.ok) {
        const body = await matchRes.json().catch(() => ({}));
        const msg = typeof body.error === "string" ? body.error : `Match score failed: ${matchRes.status}`;
        throw new Error(msg);
      }

      const matchData = await matchRes.json();

      setResult({
        jobTitle: parseData.jobTitle,
        company: parseData.company,
        matchScore: matchData
      });
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
          See how your current skills match up against this specific role.
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
              <Target size={16} />
              Check My Match Score
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
          {/* Job Header + Score */}
          <div className="rounded-lg border border-border bg-surface p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-ink">{result.jobTitle}</h2>
                {result.company && (
                  <p className="mt-1 text-sm text-muted">{result.company}</p>
                )}
              </div>
              <div className="text-center">
                <div className="relative inline-flex items-center justify-center">
                  <svg className="h-24 w-24 -rotate-90" viewBox="0 0 36 36">
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="rgba(255,255,255,0.12)"
                      strokeWidth="3"
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke={result.matchScore.overall >= 0.8 ? "#10b981" : result.matchScore.overall >= 0.5 ? "#f59e0b" : "#ef4444"}
                      strokeWidth="3"
                      strokeDasharray={`${result.matchScore.overall * 100}, 100`}
                    />
                  </svg>
                  <span className="absolute text-2xl font-bold text-ink">
                    {Math.round(result.matchScore.overall * 100)}%
                  </span>
                </div>
                <div className="mt-2 text-xs uppercase tracking-wide text-muted">
                  match score
                </div>
              </div>
            </div>
          </div>

          {/* Per-Skill Breakdown */}
          <div className="rounded-lg border border-border bg-surface p-6">
            <h3 className="text-lg font-semibold text-ink">Skill Breakdown</h3>
            <div className="mt-4 space-y-3">
              {result.matchScore.perSkill
                .sort((a, b) => {
                  const statusOrder = { missing: 0, partial: 1, mastered: 2 };
                  return statusOrder[a.status] - statusOrder[b.status] || b.importance - a.importance;
                })
                .map((skill) => {
                  const config = STATUS_CONFIG[skill.status];
                  const Icon = config.icon;
                  return (
                    <div key={skill.skillId} className="flex items-center gap-4">
                      <Icon size={16} className={config.color} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-ink">{skill.skillName}</span>
                          <span className="text-sm text-muted">
                            {Math.round(skill.mastery * 100)}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className={`h-full rounded-full transition-all ${config.bg}`}
                            style={{ width: `${Math.min(100, skill.mastery * 100)}%` }}
                          />
                        </div>
                      </div>
                      <span className="w-16 text-right text-xs text-muted">
                        {Math.round(skill.importance * 100)}% imp
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-lg border border-border bg-surface p-6">
            <h3 className="text-lg font-semibold text-ink">Summary</h3>
            <div className="mt-4 grid grid-cols-3 gap-4 text-center">
              <div className="rounded-md bg-emerald-500/10 p-4">
                <div className="text-2xl font-bold text-emerald-300">
                  {result.matchScore.perSkill.filter((s) => s.status === "mastered").length}
                </div>
                <div className="text-xs text-muted">Mastered</div>
              </div>
              <div className="rounded-md bg-amber-500/10 p-4">
                <div className="text-2xl font-bold text-amber-300">
                  {result.matchScore.perSkill.filter((s) => s.status === "partial").length}
                </div>
                <div className="text-xs text-muted">Partial</div>
              </div>
              <div className="rounded-md bg-red-500/10 p-4">
                <div className="text-2xl font-bold text-red-300">
                  {result.matchScore.perSkill.filter((s) => s.status === "missing").length}
                </div>
                <div className="text-xs text-muted">Missing</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
