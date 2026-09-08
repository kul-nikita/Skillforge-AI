import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Award,
  Compass,
  FileCheck2,
  LockKeyhole,
  Route,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import { ExplainButton } from "@/components/ExplainButton";
import { ResourceSearch } from "@/components/ResourceSearch";
import { SkillHeatmap } from "@/components/SkillHeatmap";
import { ReadinessTimeline } from "@/components/ReadinessTimeline";
import { buildRoadmap, candidatesForGap } from "@/lib/services/recommendations";
import { getMastery, getProfile, listEvidence, listEvents } from "@/lib/db/learners";
import { listDomains, listRoles, getSkillGraph } from "@/lib/graph/queries";
import { DEFAULT_PREFERENCES, DEFAULT_WEEKLY_HOURS } from "@/lib/constants";
import { requireUserOrRedirect } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import { SiteHeader } from "@/components/SiteHeader";
import { predictTimeline } from "@/lib/prediction/timeline";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUserOrRedirect("/dashboard");
  const [profile, mastery, evidence, roles, domains, events, graph] = await Promise.all([
    getProfile(user.id),
    getMastery(user.id),
    listEvidence(user.id),
    listRoles(),
    listDomains(),
    listEvents(user.id),
    getSkillGraph()
  ]);

  const targetRoleId = profile?.targetRoleId ?? roles[0]?.id;

  if (!targetRoleId) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">No roles are seeded yet</h1>
        <p className="mt-3 text-muted">
          Run <code className="rounded bg-canvas px-1.5 py-0.5">npm run db:seed:all</code> to load the
          skill graph and catalog.
        </p>
      </main>
    );
  }

  const preferences = profile?.preferences ?? DEFAULT_PREFERENCES;
  const weeklyHours = profile?.weeklyHours ?? DEFAULT_WEEKLY_HOURS;
  const roadmap = await buildRoadmap(targetRoleId, mastery);

  const role = roles.find((r) => r.id === targetRoleId);
  const timelineData = role
    ? predictTimeline({ profile, mastery, role, graph, events })
    : null;
  const firstUnlockedGap =
    roadmap.gaps.find((gap) => gap.skill.prerequisites.every((id) => (mastery[id] ?? 0) >= 0.6)) ??
    roadmap.gaps[0];
  const recommendations = firstUnlockedGap
    ? (await candidatesForGap(firstUnlockedGap, mastery, preferences, weeklyHours)).slice(0, 2)
    : [];

  const domainName = domains.find((domain) => domain.id === roadmap.role.domainId)?.name ?? roadmap.role.domainId;
  const readinessPercent = Math.round(roadmap.readiness * 100);
  const totalRoleSkills = roadmap.gaps.length + roadmap.mastered.length;
  const masteredCount = roadmap.mastered.length;
  const unlockedGaps = roadmap.gaps.filter((gap) =>
    gap.skill.prerequisites.every((id) => (mastery[id] ?? 0) >= 0.6)
  );
  const lockedGaps = roadmap.gaps.length - unlockedGaps.length;
  const averageEvidenceScore =
    evidence.length > 0
      ? Math.round((evidence.reduce((sum, item) => sum + item.rubricScore, 0) / evidence.length) * 100)
      : 0;
  const nextGapName = firstUnlockedGap?.skill.name ?? "Portfolio evidence";

  return (
    <>
      <SiteHeader current="/dashboard" showAdmin={isAdmin(user)} user={user} />
      <main
        className="min-h-screen bg-[linear-gradient(180deg,#050816_0%,#07101f_42%,#050816_100%)] text-ink"
        id="main"
      >
        <section className="relative overflow-hidden border-b border-white/10">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(34,211,238,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,0.12) 1px, transparent 1px)",
              backgroundSize: "72px 72px"
            }}
          />
          <div className="relative mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[1fr_380px] lg:items-stretch lg:py-10">
            <div className="flex min-h-[360px] flex-col justify-between rounded-lg border border-white/10 bg-white/[0.035] p-6 shadow-lift backdrop-blur md:p-8">
              <div>
                <div className="inline-flex items-center gap-2 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase text-cyan-200">
                  <Sparkles aria-hidden="true" size={14} />
                  {domainName}
                </div>
                <h1 className="mt-5 max-w-4xl font-display text-4xl font-semibold tracking-normal text-white md:text-6xl">
                  {roadmap.role.title} command center
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
                  Your next moves, open skill gaps, verified recommendations, and portfolio proof in one
                  prerequisite-aware workspace.
                </p>
              </div>

              {Object.keys(mastery).length === 0 ? (
                <div className="mt-8 rounded-lg border border-amber-300/25 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
                  No diagnostic is on record yet, so this view starts from zero mastery. Run the diagnostic
                  to replace the estimate with your real signal.
                </div>
              ) : (
                <div className="mt-8 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
                  <MiniSignal label="Weekly pace" value={`${weeklyHours}h`} />
                  <MiniSignal label="Evidence" value={`${evidence.length}`} />
                  <MiniSignal label="Open gaps" value={`${roadmap.gaps.length}`} />
                </div>
              )}
            </div>

            <aside className="rounded-lg border border-white/10 bg-[#091126]/90 p-6 shadow-lift backdrop-blur">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-400">Role readiness</p>
                  <p className="mt-1 text-5xl font-semibold text-white">{readinessPercent}%</p>
                </div>
                <ProgressRing value={readinessPercent} />
              </div>
              <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-emerald-300 to-amber-200"
                  style={{ width: `${readinessPercent}%` }}
                />
              </div>

              <div className="mt-6 space-y-3">
                <Link
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white transition hover:bg-cyan-800"
                  href="/diagnostic"
                >
                  <Compass aria-hidden="true" size={17} />
                  Run adaptive diagnostic
                </Link>
                <Link
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-100 transition hover:border-cyan-300/50 hover:bg-cyan-300/10"
                  href="/evidence"
                >
                  <FileCheck2 aria-hidden="true" size={17} />
                  View evidence wallet
                </Link>
                {isAdmin(user) ? (
                  <Link
                    className="inline-flex h-11 w-full items-center justify-center rounded-md border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-100 transition hover:border-cyan-300/50 hover:bg-cyan-300/10"
                    href="/admin"
                  >
                    Catalog admin
                  </Link>
                ) : null}
              </div>
            </aside>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatTile
              detail="Cleared for this role"
              icon={<ShieldCheck aria-hidden="true" size={19} />}
              label="Mastered skills"
              tone="cyan"
              value={`${masteredCount}/${totalRoleSkills}`}
            />
            <StatTile
              detail="Ready to work on now"
              icon={<Route aria-hidden="true" size={19} />}
              label="Unlocked gaps"
              tone="emerald"
              value={`${unlockedGaps.length}`}
            />
            <StatTile
              detail="Blocked by graph order"
              icon={<LockKeyhole aria-hidden="true" size={19} />}
              label="Waiting on prerequisites"
              tone="violet"
              value={`${lockedGaps}`}
            />
            <StatTile
              detail={evidence.length > 0 ? "Average rubric score" : "No submitted proof yet"}
              icon={<Award aria-hidden="true" size={19} />}
              label="Evidence quality"
              tone="amber"
              value={evidence.length > 0 ? `${averageEvidenceScore}%` : "New"}
            />
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-6 pb-10 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
          <div className="space-y-6">
            <article className="rounded-lg border border-white/10 bg-surface/95 p-5 shadow-card">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-cyan-200">
                    <Compass aria-hidden="true" size={20} />
                    <h2 className="text-lg font-semibold text-white">Next best move</h2>
                  </div>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                    Focus on the first skill that clears the prerequisite gate. The recommendation list below
                    is scored for your stated pace, format, cost, and current mastery.
                  </p>
                </div>
                <span className="inline-flex shrink-0 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-sm font-semibold text-cyan-100">
                  {nextGapName}
                </span>
              </div>

              {recommendations.length === 0 ? (
                <p className="mt-5 rounded-md border border-white/10 bg-white/5 p-4 text-sm text-muted">
                  No resource clears the prerequisite gate for your top gap yet.
                </p>
              ) : (
                <div className="mt-6 space-y-6">
                  {recommendations.map((item) => (
                    <div className="border-t border-white/10 pt-6 first:border-t-0 first:pt-0" key={item.resource.id}>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase text-slate-400">
                            <span>{item.resource.provider}</span>
                            <span className="h-1 w-1 rounded-full bg-slate-600" />
                            <span>{item.explanation.estimatedTime}</span>
                            <span className="h-1 w-1 rounded-full bg-slate-600" />
                            <span>{item.resource.costType}</span>
                          </div>
                          <h3 className="mt-2 text-2xl font-semibold tracking-normal text-white">
                            {item.resource.title}
                          </h3>
                          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
                            {item.explanation.whatGapItCloses}
                          </p>
                        </div>
                        <a
                          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white transition hover:bg-cyan-800"
                          href={item.resource.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open
                          <ArrowUpRight aria-hidden="true" size={16} />
                        </a>
                      </div>
                      {firstUnlockedGap && (
                        <div className="mt-4">
                          <ExplainButton resourceId={item.resource.id} skillId={firstUnlockedGap.skill.id} />
                        </div>
                      )}
                      <div className="mt-4">
                        <ScoreBreakdown score={item.score} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="rounded-lg border border-white/10 bg-surface/95 p-5 shadow-card">
              <div className="flex items-center gap-2 text-cyan-200">
                <Route aria-hidden="true" size={20} />
                <h2 className="text-lg font-semibold text-white">Roadmap queue</h2>
              </div>
              <ol className="mt-5 space-y-3">
                {roadmap.gaps.slice(0, 7).map((gap, index) => {
                  const unlocked = gap.skill.prerequisites.every((id) => (mastery[id] ?? 0) >= 0.6);
                  return (
                    <li className="rounded-md border border-white/10 bg-white/[0.03] p-4" key={gap.skill.id}>
                      <div className="flex items-start gap-4">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-cyan-300/10 text-sm font-semibold text-cyan-100">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <h3 className="font-semibold text-white">{gap.skill.name}</h3>
                            <div className="flex items-center gap-2">
                              <span className="rounded-md bg-white/5 px-2 py-1 text-xs font-semibold text-slate-200">
                                {Math.round(gap.currentMastery * 100)}%
                              </span>
                              <span
                                className={`rounded-md px-2 py-1 text-xs font-semibold ${
                                  unlocked
                                    ? "bg-emerald-300/10 text-emerald-200"
                                    : "bg-violet-300/10 text-violet-200"
                                }`}
                              >
                                {unlocked ? "Unlocked" : "Locked"}
                              </span>
                            </div>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-muted">{gap.reason}</p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </article>
          </div>

          <div className="space-y-6">
            <article className="rounded-lg border border-white/10 bg-surface/95 p-5 shadow-card">
              <div className="flex items-center gap-2 text-amber-200">
                <Award aria-hidden="true" size={20} />
                <h2 className="text-lg font-semibold text-white">Evidence wallet</h2>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-[140px_1fr]">
                <div className="rounded-md border border-white/10 bg-amber-300/10 p-4">
                  <p className="text-4xl font-semibold text-white">{evidence.length}</p>
                  <p className="mt-1 text-sm text-amber-100">
                    completed milestone{evidence.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div>
                  <p className="text-sm leading-6 text-muted">
                    Each completed resource can become recruiter-readable proof when the post-check is graded.
                  </p>
                  <ul className="mt-4 space-y-2 text-sm">
                    {evidence.slice(0, 3).map((item) => (
                      <li className="flex items-center justify-between gap-3 rounded-md bg-white/[0.03] px-3 py-2" key={item.id}>
                        <span className="min-w-0 truncate text-ink">{item.summary}</span>
                        <span className="shrink-0 rounded-md bg-white/5 px-2 py-1 font-medium text-slate-200">
                          {Math.round(item.rubricScore * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-200 hover:text-cyan-100"
                    href="/evidence"
                  >
                    Open full wallet
                    <ArrowUpRight aria-hidden="true" size={15} />
                  </Link>
                </div>
              </div>
            </article>

            <SkillHeatmap gaps={roadmap.gaps} mastered={roadmap.mastered} mastery={mastery} />

            {timelineData && role && (
              <ReadinessTimeline
                data={{
                  role: { id: role.id, title: role.title },
                  prediction: timelineData,
                  currentReadiness: roadmap.readiness
                }}
              />
            )}

            <ResourceSearch />
          </div>
        </section>
      </main>
    </>
  );
}

function ProgressRing({ value }: { value: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid h-28 w-28 shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(#67e8f9 ${value * 3.6}deg, rgba(255,255,255,0.08) 0deg)`
      }}
    >
      <div className="grid h-20 w-20 place-items-center rounded-full bg-[#091126] text-sm font-semibold text-cyan-100">
        {value}%
      </div>
    </div>
  );
}

function MiniSignal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  detail,
  tone
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: "cyan" | "emerald" | "violet" | "amber";
}) {
  const tones = {
    cyan: "border-cyan-300/20 bg-cyan-300/10 text-cyan-200",
    emerald: "border-emerald-300/20 bg-emerald-300/10 text-emerald-200",
    violet: "border-violet-300/20 bg-violet-300/10 text-violet-200",
    amber: "border-amber-300/20 bg-amber-300/10 text-amber-200"
  };

  return (
    <article className="rounded-lg border border-white/10 bg-surface/90 p-4 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-md border ${tones[tone]}`}>{icon}</span>
      </div>
    </article>
  );
}
