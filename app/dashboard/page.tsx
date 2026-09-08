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
} from "lucide-react";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import { ExplainButton } from "@/components/ExplainButton";
import { ResourceSearch } from "@/components/ResourceSearch";
import { SkillHeatmap } from "@/components/SkillHeatmap";
import { GapReason } from "@/components/GapReason";
import { ReadinessTimeline } from "@/components/ReadinessTimeline";
import { buildRoadmap, candidatesForGap } from "@/lib/services/recommendations";
import { getMastery, getProfile, listEvidence, listEvents } from "@/lib/db/learners";
import { listDomains, listRoles, getSkillGraph } from "@/lib/graph/queries";
import { DEFAULT_PREFERENCES, DEFAULT_WEEKLY_HOURS } from "@/lib/constants";
import { requireUserOrRedirect } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import { SiteHeader } from "@/components/SiteHeader";
import { JourneyStrip } from "@/components/JourneyStrip";
import { MentorPanel } from "@/components/MentorPanel";
import { MilestoneTrack } from "@/components/MilestoneTrack";
import { FirstRun } from "@/components/FirstRun";
import { currentStage } from "@/lib/services/journey";
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

  const stage = currentStage({ profile, events, evidence });
  const targetRoleId = profile?.targetRoleId;

  // Without a goal there is no roadmap to show. Showing roles[0]'s plan instead
  // — readiness, gaps, recommendations and all — told every new learner they
  // were partway through a career they had never chosen.
  if (!targetRoleId) {
    return (
      <>
        <SiteHeader current="/dashboard" showAdmin={isAdmin(user)} user={user} />
        <JourneyStrip stage={stage} />
        <main className="min-h-screen bg-canvas text-ink" id="main">
          <FirstRun hasRoles={roles.length > 0} />
        </main>
      </>
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
      <JourneyStrip stage={stage} />
      <main
        className="min-h-screen bg-[linear-gradient(180deg,#050816_0%,#07101f_42%,#050816_100%)] text-ink"
        id="main"
      >
        <section className="mx-auto max-w-7xl px-6 pt-8">
          <div className="flex flex-col gap-6 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted">{domainName}</p>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
                {roadmap.role.title}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted">
                {weeklyHours}h per week
                <span className="px-2 text-slate-600">/</span>
                {roadmap.gaps.length} open gap{roadmap.gaps.length === 1 ? "" : "s"}
                <span className="px-2 text-slate-600">/</span>
                {evidence.length} evidence item{evidence.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-canvas transition hover:bg-white"
                href="/diagnostic"
              >
                <Compass aria-hidden="true" size={16} />
                Run diagnostic
              </Link>
              <Link
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-100 transition hover:border-cyan-300/50 hover:bg-cyan-300/10"
                href="/evidence"
              >
                <FileCheck2 aria-hidden="true" size={16} />
                Evidence wallet
              </Link>
              {isAdmin(user) ? (
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-md border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-100 transition hover:border-cyan-300/50 hover:bg-cyan-300/10"
                  href="/admin"
                >
                  Catalog admin
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-6">
          {Object.keys(mastery).length === 0 ? (
            <div className="mb-4 rounded-md border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">
              No diagnostic is on record yet, so this view starts from zero mastery. Run the diagnostic to
              replace the estimate with your real signal.
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <article className="rounded-lg border border-white/10 bg-surface/90 p-4 shadow-card md:col-span-2 xl:col-span-1">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted">Role readiness</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{readinessPercent}%</p>
                  <p className="mt-1 text-xs text-slate-500">Weighted by skill importance</p>
                </div>
                <ProgressRing value={readinessPercent} />
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-cyan-300"
                  style={{ width: `${readinessPercent}%` }}
                />
              </div>
            </article>
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

        <section className="mx-auto grid max-w-7xl gap-6 px-6 pb-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,1fr)]">
          <article className="rounded-lg border border-white/10 bg-surface/95 shadow-card">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2 text-cyan-200">
                <Compass aria-hidden="true" size={18} />
                <h2 className="text-base font-semibold text-white">Next best move</h2>
              </div>
              <span className="inline-flex rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-xs font-semibold text-cyan-100">
                {nextGapName}
              </span>
            </header>

            <div className="p-5">
              <p className="text-sm leading-6 text-muted">
                The first skill that clears the prerequisite gate. Each option is scored against your
                pace, format, cost, and current mastery.
              </p>

              {recommendations.length === 0 ? (
                <p className="mt-4 rounded-md border border-white/10 bg-white/5 p-4 text-sm text-muted">
                  No resource clears the prerequisite gate for your top gap yet.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {recommendations.map((item) => (
                    <div
                      className="rounded-lg border border-white/10 bg-white/[0.03] p-4"
                      key={item.resource.id}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                            <span>{item.resource.provider}</span>
                            <span className="h-1 w-1 rounded-full bg-slate-600" />
                            <span>{item.explanation.estimatedTime}</span>
                            <span className="h-1 w-1 rounded-full bg-slate-600" />
                            <span>{item.resource.costType}</span>
                          </div>
                          <h3 className="mt-2 text-lg font-semibold leading-6 text-white">
                            {item.resource.title}
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-muted">
                            {item.explanation.whatGapItCloses}
                          </p>
                        </div>
                        <a
                          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-cyan-700 px-3.5 text-sm font-semibold text-white transition hover:bg-cyan-800"
                          href={item.resource.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open
                          <ArrowUpRight aria-hidden="true" size={15} />
                        </a>
                      </div>

                      <div className="mt-4">
                        <ScoreBreakdown score={item.score} />
                      </div>

                      {firstUnlockedGap && (
                        <div className="mt-3">
                          <ExplainButton resourceId={item.resource.id} skillId={firstUnlockedGap.skill.id} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>

          <article className="rounded-lg border border-white/10 bg-surface/95 shadow-card">
            <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2 text-cyan-200">
                <Route aria-hidden="true" size={18} />
                <h2 className="text-base font-semibold text-white">Roadmap queue</h2>
              </div>
              <span className="rounded-md bg-white/5 px-2 py-1 text-xs font-semibold text-slate-300">
                {roadmap.gaps.length} skills
              </span>
            </header>

            <ol className="divide-y divide-white/10">
              {roadmap.gaps.slice(0, 7).map((gap, index) => {
                const unlocked = gap.skill.prerequisites.every((id) => (mastery[id] ?? 0) >= 0.6);
                return (
                  <li className="flex items-start gap-3 px-5 py-3.5" key={gap.skill.id}>
                    <span
                      className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-semibold ${
                        unlocked ? "bg-emerald-300/10 text-emerald-200" : "bg-white/5 text-slate-400"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="truncate text-sm font-semibold text-white">{gap.skill.name}</h3>
                        <span className="shrink-0 text-xs font-semibold text-slate-400">
                          {Math.round(gap.currentMastery * 100)}%
                        </span>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full ${unlocked ? "bg-cyan-300" : "bg-violet-300/60"}`}
                          style={{ width: `${Math.max(Math.round(gap.currentMastery * 100), 3)}%` }}
                        />
                      </div>
                      <GapReason
                        blockedBy={gap.blockedBy}
                        currentMastery={gap.currentMastery}
                        reason={gap.reason}
                        skillName={gap.skill.name}
                        unlocks={gap.unlocks}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          </article>
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-6 pb-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,1fr)]">
          <SkillHeatmap gaps={roadmap.gaps} mastered={roadmap.mastered} mastery={mastery} />
          <MilestoneTrack milestones={roadmap.milestones} />
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-6">
          <MentorPanel />
        </section>

        {timelineData && role && (
          <section className="mx-auto max-w-7xl px-6 pb-6">
            <ReadinessTimeline
              data={{
                role: { id: role.id, title: role.title },
                prediction: timelineData,
                currentReadiness: roadmap.readiness
              }}
            />
          </section>
        )}

        <section className="mx-auto grid max-w-7xl gap-6 px-6 pb-12 lg:grid-cols-2">
          <article className="rounded-lg border border-white/10 bg-surface/95 shadow-card">
            <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2 text-amber-200">
                <Award aria-hidden="true" size={18} />
                <h2 className="text-base font-semibold text-white">Evidence wallet</h2>
              </div>
              <span className="rounded-md border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-xs font-semibold text-amber-100">
                {evidence.length} milestone{evidence.length === 1 ? "" : "s"}
              </span>
            </header>
            <div className="p-5">
              <p className="text-sm leading-6 text-muted">
                Each completed resource becomes recruiter-readable proof once the post-check is graded.
              </p>
              {evidence.length === 0 ? (
                <p className="mt-4 rounded-md border border-white/10 bg-white/5 p-4 text-sm text-muted">
                  Nothing here yet. Finish a recommended resource and pass its post-check.
                </p>
              ) : (
                <ul className="mt-4 space-y-2 text-sm">
                  {evidence.slice(0, 4).map((item) => (
                    <li
                      className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2.5"
                      key={item.id}
                    >
                      <span className="min-w-0 truncate text-ink">{item.summary}</span>
                      <span className="shrink-0 rounded-md bg-white/5 px-2 py-1 text-xs font-semibold text-slate-200">
                        {Math.round(item.rubricScore * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-200 hover:text-cyan-100"
                href="/evidence"
              >
                Open full wallet
                <ArrowUpRight aria-hidden="true" size={15} />
              </Link>
            </div>
          </article>

          <ResourceSearch />
        </section>
      </main>
    </>
  );
}

function ProgressRing({ value }: { value: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid h-20 w-20 shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(#67e8f9 ${value * 3.6}deg, rgba(255,255,255,0.08) 0deg)`
      }}
    >
      <div className="h-14 w-14 rounded-full bg-surface" />
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
