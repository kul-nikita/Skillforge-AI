import Link from "next/link";
import {
  ArrowRight,
  Award,
  BrainCircuit,
  Check,
  CircleDot,
  GitBranch,
  Layers3,
  Search,
  Sparkles,
  Target,
  Zap,
  ShieldCheck,
  BarChart3,
  Code2,
  Database,
  LockKeyhole,
  Palette,
  Cpu,
} from "lucide-react";

import { listDomains, listRoles, getSkillGraph } from "@/lib/graph/queries";
import { pickChain } from "@/components/PrerequisiteChain";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    number: "01",
    icon: GitBranch,
    title: "Prerequisites built into the path",
    text: "Your roadmap follows a real skill dependency graph, so foundations come before advanced concepts.",
  },
  {
    number: "02",
    icon: BrainCircuit,
    title: "Recommendations you can understand",
    text: "Every recommendation explains why it was selected instead of hiding the decision inside a black box.",
  },
  {
    number: "03",
    icon: Search,
    title: "Resources you can actually use",
    text: "Learning resources come from a verified catalog with useful information such as duration, links and cost.",
  },
  {
    number: "04",
    icon: Award,
    title: "Turn learning into evidence",
    text: "Completed milestones become capability records that demonstrate what you can actually do.",
  },
];

const CAREER_ICONS = [
  Code2,
  BarChart3,
  ShieldCheck,
  BrainCircuit,
  Palette,
];

// Counted from the seeded graph at request time. Hardcoding them is how this
// page ends up contradicting its own footer.
function statsFor(domains: number, roles: number, skills: number) {
  return [
    { value: String(domains), label: "Learning Domains", icon: Layers3 },
    { value: String(roles), label: "Career Tracks", icon: Target },
    { value: String(skills), label: "Skills in Graph", icon: GitBranch },
    { value: "AI", label: "Personalized Paths", icon: Sparkles },
    { value: "∞", label: "Learning Possibilities", icon: Zap },
  ];
}

export default async function LandingPage() {
  const [domains, roles, user, graph] = await Promise.all([
    listDomains(),
    listRoles(),
    getCurrentUser(),
    getSkillGraph(),
  ]);

  const displayedRoles = roles.slice(0, 5);
  const stats = statsFor(domains.length, roles.length, graph.skills.length);

  // Sourced from the seeded graph, so the hero illustration cannot drift from
  // what the planner actually does.
  const heroChain = pickChain(graph.skills, 4);
  // A real role that actually requires the last skill in the chain.
  const heroGoal =
    roles.find((role) =>
      role.requiredSkills.some((required) => required.skillId === heroChain.at(-1)?.id)
    ) ?? roles[0];
  // Public page: an empty or unreachable graph degrades to a quiet panel, not a 500.
  const heroSteps = heroChain.map((skill, index) => ({
    n: index === 0 ? "✓" : index === 1 ? "→" : String(index + 1),
    title: skill.name,
    active: index === 1,
    sub:
      index === 0
        ? "Mastery on record"
        : index === 1
          ? "Recommended next"
          : `Unlocks after ${heroChain[index - 1].name}`,
  }));

  return (
    <main className="min-h-screen overflow-hidden bg-[#050816] text-white" id="main">
      <SiteHeader showAdmin={isAdmin(user)} user={user} />

      {/* ========================================================= */}
      {/* HERO */}
      {/* ========================================================= */}

      <section className="relative min-h-[720px] overflow-hidden border-b border-white/10">
        {/* Complex background */}
        <div className="absolute inset-0 skillforge-hero-bg" />

        {/* Neural grid */}
        <div className="absolute inset-0 skillforge-grid opacity-40" />

        {/* Glow orbs */}

        {/* Decorative neural lines */}
        <div className="pointer-events-none absolute left-[28%] top-[16%] h-[400px] w-[400px] opacity-70">
          <div className="neural-line neural-line-one" />
          <div className="neural-line neural-line-two" />
          <div className="neural-line neural-line-three" />
          <div className="neural-node node-one" />
          <div className="neural-node node-two" />
          <div className="neural-node node-three" />
          <div className="neural-node node-four" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 pb-20 pt-14 md:pt-20">
          <div className="grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr]">
            {/* LEFT */}
            <div className="relative z-10">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/5 px-4 py-2 text-xs font-semibold tracking-wide text-cyan-200">
                <Sparkles size={15} />
                AI-POWERED PERSONALIZED LEARNING
              </div>

              <h1 className="max-w-2xl text-5xl font-bold leading-[0.98] tracking-[-0.04em] md:text-7xl">
                Know what to
                <br />
                learn{" "}
                <span className="skillforge-gradient-text">
                  next.
                </span>
              </h1>

              <h2 className="mt-7 max-w-xl text-2xl font-semibold leading-tight text-slate-200 md:text-3xl">
                And be able to prove
                <br />
                you learned it.
              </h2>

              <p className="mt-7 max-w-xl text-base leading-7 text-slate-300 md:text-lg">
                SkillForge maps your goals, analyzes your skills, finds gaps,
                orders them in the right sequence, and turns every milestone
                into real evidence.
              </p>

              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  href="/onboarding"
                  className="group inline-flex h-12 items-center gap-3 rounded-md bg-ink px-6 text-sm font-semibold text-canvas transition-colors hover:bg-white"
                >
                  <Sparkles size={18} />
                  Build my learning path
                  <ArrowRight
                    size={17}
                    className="transition group-hover:translate-x-1"
                  />
                </Link>

                <Link
                  href="/diagnostic"
                  className="group inline-flex h-13 items-center gap-3 rounded-xl border border-white/20 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-white transition hover:border-cyan-400/40 hover:bg-white/[0.08]"
                >
                  Take the diagnostic
                  <ArrowRight
                    size={17}
                    className="transition group-hover:translate-x-1"
                  />
                </Link>
              </div>

              <div className="mt-9 flex flex-wrap gap-x-7 gap-y-3">
                {[
                  "Skill-gap analysis",
                  "Prerequisite-aware",
                  "Explainable AI",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 text-sm text-slate-400"
                  >
                    <Check size={15} className="text-cyan-300" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT - ONE INTEGRATED AI CARD */}
            <div className="relative z-10 flex justify-center lg:justify-end">
              <div className="skillforge-path-panel relative w-full max-w-[560px] overflow-hidden rounded-lg border border-border bg-surface p-5 md:p-6">
                {/* Panel glow */}

                <div className="relative">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="grid h-11 w-11 place-items-center rounded-md border border-border bg-surface-sunken">
                        <BrainCircuit size={23} />
                      </div>

                      <div>
                        <p className="text-sm font-semibold">
                          Your AI Learning Path
                        </p>
                        <p className="text-xs text-slate-400">
                          Continuously personalized
                        </p>
                      </div>
                    </div>

                    <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-[10px] font-bold text-cyan-300">
                      PERSONALIZED
                    </span>
                  </div>

                  {/* Goal */}
                  <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-full border border-fuchsia-400/50 text-fuchsia-300">
                        <Target size={18} />
                      </div>

                      <div>
                        <p className="text-[11px] text-slate-500">
                          Current Goal
                        </p>
                        <p className="mt-1 text-sm font-semibold">
                          {heroGoal?.title ?? "Pick a career track"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Path */}
                  <div className="relative mt-7">
                    <div className="absolute left-[16px] top-5 h-[205px] w-px bg-border" />

                    {heroSteps.map((step) => (
                      <div
                        key={step.title}
                        className="relative mb-5 flex items-start gap-4 last:mb-0"
                      >
                        <div
                          className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-bold ${
                            step.active
                              ? "border-cyan-300/60 bg-cyan-400/10 text-cyan-300"
                              : "border-violet-400/60 bg-[#0b1026] text-white"
                          }`}
                        >
                          {step.n}
                        </div>

                        <div className="pt-0.5">
                          <p className="text-sm font-semibold">
                            {step.title}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {step.sub}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Confidence - INSIDE panel */}
                  <div className="mt-7 flex items-center justify-between rounded-md border border-border bg-surface-sunken px-4 py-4">
                    <div>
                      <p className="text-[11px] font-medium text-slate-400">
                        AI Confidence
                      </p>
                      <p className="mt-1 text-lg font-bold">94% match</p>
                    </div>

                    <div className="flex h-10 items-end gap-1">
                      {[15, 23, 18, 30, 25, 34, 28, 38].map((height, i) => (
                        <span
                          key={i}
                          className="w-1.5 rounded-t bg-cyan-400/70"
                          style={{ height }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* STATS */}
          <div className="relative z-10 mt-16 overflow-hidden rounded-lg border border-border bg-surface">
            <div className="grid grid-cols-2 md:grid-cols-5">
              {stats.map((stat, index) => {
                const Icon = stat.icon;

                return (
                  <div
                    key={stat.label}
                    className={`flex items-center gap-4 px-5 py-6 ${
                      index !== stats.length - 1
                        ? "border-b border-white/10 md:border-b-0 md:border-r"
                        : ""
                    }`}
                  >
                    <Icon
                      size={25}
                      className="shrink-0 text-cyan-300"
                    />

                    <div>
                      <p className="text-xl font-bold">{stat.value}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {stat.label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* DIFFERENT SECTION */}
      {/* ========================================================= */}

      <section className="relative overflow-hidden border-b border-white/10 bg-[#070b1c] py-24">
        <div className="absolute inset-0 skillforge-grid opacity-20" />

        <div className="relative mx-auto max-w-7xl px-6">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-medium text-muted">The difference</p>

            <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
              More than a course
              <span className="skillforge-gradient-text">
                {" "}
                recommender.
              </span>
            </h2>

            <p className="mt-5 text-lg leading-8 text-slate-400">
              The goal isn't to give learners more choices.
              It's to give them the right next choice.
            </p>
          </div>

          <div className="mt-16 grid gap-5 md:grid-cols-2">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;

              return (
                <article
                  key={feature.number}
                  className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025] p-7 transition duration-300 hover:-translate-y-1 hover:border-cyan-400/30 hover:bg-white/[0.045]"
                >

                  <div className="relative flex gap-5">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300">
                      <Icon size={21} />
                    </div>

                    <div>
                      <div className="text-xs font-bold tracking-widest text-cyan-400">
                        {feature.number}
                      </div>

                      <h3 className="mt-2 text-xl font-semibold">
                        {feature.title}
                      </h3>

                      <p className="mt-3 text-sm leading-7 text-slate-400">
                        {feature.text}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* HOW IT WORKS */}
      {/* ========================================================= */}

      <section className="relative overflow-hidden bg-[#050816] py-24" id="how-it-works">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="mb-3 text-sm font-medium text-muted">Your journey</p>

              <h2 className="text-4xl font-bold md:text-5xl">
                How SkillForge works
              </h2>
            </div>

            <p className="max-w-md text-sm leading-6 text-slate-400">
              From a simple goal to an adaptive learning journey backed by
              skills, milestones and evidence.
            </p>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-4">
            {[
              {
                n: "01",
                icon: Target,
                title: "Tell us your goal",
                text: "Describe the role or outcome you want to achieve.",
              },
              {
                n: "02",
                icon: Search,
                title: "We analyze your skills",
                text: "We map your strengths, weaknesses and learning preferences.",
              },
              {
                n: "03",
                icon: BrainCircuit,
                title: "AI builds your path",
                text: "Prerequisite-aware sequencing creates your personalized roadmap.",
              },
              {
                n: "04",
                icon: Award,
                title: "Learn & prove it",
                text: "Milestones become evidence of the capabilities you developed.",
              },
            ].map((step) => {
              const Icon = step.icon;

              return (
                <div key={step.n} className="relative">
                  <div className="mb-5 flex items-center gap-4">
                    <div className="grid h-14 w-14 place-items-center rounded-full border border-cyan-400/30 bg-cyan-400/5 text-cyan-300">
                      <Icon size={22} />
                    </div>

                    <span className="text-xs font-bold tracking-widest text-slate-600">
                      {step.n}
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold">{step.title}</h3>

                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    {step.text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* CAREER TRACKS */}
      {/* ========================================================= */}

      <section className="relative overflow-hidden border-y border-white/10 bg-[#080c20] py-24" id="career-tracks">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="mb-3 text-sm font-medium text-muted">Explore</p>

              <h2 className="text-4xl font-bold md:text-5xl">
                Explore career tracks
              </h2>
            </div>

            <div className="hidden rounded-lg border border-violet-400/30 px-4 py-2 text-sm text-violet-300 md:block">
              {roles.length} tracks
            </div>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {displayedRoles.map((role, index) => {
              const Icon =
                CAREER_ICONS[index % CAREER_ICONS.length];

              return (
                <article
                  key={role.id}
                  className="group min-h-[190px] rounded-2xl border border-white/10 bg-[#0b1026] p-5 transition duration-300 hover:-translate-y-1 hover:border-cyan-400/30"
                >
                  <Icon
                    size={28}
                    className="text-violet-300 transition group-hover:text-cyan-300"
                  />

                  <h3 className="mt-7 text-base font-semibold">
                    {role.title}
                  </h3>

                  <p className="mt-2 text-xs text-slate-500">
                    {role.requiredSkills.length} tracked skills
                  </p>

                  <div className="mt-6 h-px bg-white/10" />

                  <p className="mt-4 line-clamp-2 text-xs leading-5 text-slate-500">
                    {role.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* TEAM / HACKATHON */}
      {/* ========================================================= */}

      <section className="relative overflow-hidden border-b border-white/10 bg-[#050816] py-20" id="about">
        <div className="absolute inset-0 skillforge-network opacity-60" />

        <div className="relative mx-auto flex max-w-7xl flex-col items-center justify-between gap-10 px-6 md:flex-row">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
              <Sparkles size={16} />
              AI-POWERED PERSONALIZED LEARNING
            </div>

            <h2 className="mt-4 text-3xl font-bold">
              Built by a team of 5 passionate learners
            </h2>

            <p className="mt-3 text-slate-400">
              Building the future of intelligent personalized learning.
            </p>
          </div>

          <div className="flex -space-x-3">
            {[1, 2, 3, 4, 5].map((member) => (
              <div
                key={member}
                className="grid h-14 w-14 place-items-center rounded-full border-2 border-canvas bg-surface"
              >
                <CircleDot size={21} className="text-slate-300" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#030510]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
          <p>SkillForge · AI-Powered Personalized Learning</p>

          <p>
            {domains.length} domains · {roles.length} career tracks ·{" "}
            {graph.skills.length} skills
          </p>
        </div>
      </footer>
    </main>
  );
}