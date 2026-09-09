import { redirect } from "next/navigation";
import { GapAnalysis } from "@/components/GapAnalysis";
import { RoleReadinessBand } from "@/components/RoleReadinessBand";
import { computeRoleMatchScore } from "@/lib/llm/jd-parsing";
import { getRole, getSkillGraph } from "@/lib/graph/queries";
import { SiteHeader } from "@/components/SiteHeader";
import { requireUserOrRedirect } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import { getMastery, getProfile } from "@/lib/db/learners";

export const dynamic = "force-dynamic";

export const metadata = { title: "Job fit" };

export default async function GapAnalyzerPage() {
  const user = await requireUserOrRedirect("/gap-analyzer");
  const profile = await getProfile(user.id);

  if (!profile?.targetRoleId) {
    redirect("/onboarding");
  }

  // Rendered on load: the baseline needs no job description and no model call,
  // so there is nothing to paste before it can be shown.
  const [role, graph, mastery] = await Promise.all([
    getRole(profile.targetRoleId),
    getSkillGraph(),
    getMastery(user.id)
  ]);

  if (!role) {
    redirect("/onboarding");
  }

  const readiness = computeRoleMatchScore(role, graph, mastery);

  return (
    <>
      <SiteHeader current="/gap-analyzer" showAdmin={isAdmin(user)} user={user} />
      <main className="min-h-screen bg-canvas">
        <section className="border-b border-border bg-surface">
          <div className="mx-auto max-w-4xl px-6 py-8">
            <h1 className="font-display text-3xl tracking-tight font-semibold text-ink">
              Job fit
            </h1>
            <p className="mt-2 max-w-2xl text-base leading-7 text-muted">
              Where you stand against {role.title}, and against any specific posting you paste. The
              baseline below needs no job description; the analysis under it reads a real one.
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
          <RoleReadinessBand
            overall={readiness.overall}
            perSkill={readiness.perSkill}
            roleTitle={role.title}
          />
          <GapAnalysis />
        </div>
      </main>
    </>
  );
}
