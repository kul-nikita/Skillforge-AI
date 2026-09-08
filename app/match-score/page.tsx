import { redirect } from "next/navigation";
import { MatchScoreCard } from "@/components/MatchScoreCard";
import { SiteHeader } from "@/components/SiteHeader";
import { requireUserOrRedirect } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import { getProfile } from "@/lib/db/learners";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Am I Ready? Match Score"
};

export default async function MatchScorePage() {
  const user = await requireUserOrRedirect("/match-score");
  const profile = await getProfile(user.id);

  if (!profile?.targetRoleId) {
    redirect("/onboarding");
  }

  return (
    <>
      <SiteHeader current="/match-score" showAdmin={isAdmin(user)} user={user} />
      <main className="min-h-screen bg-canvas">
        <section className="border-b border-border bg-surface">
          <div className="mx-auto max-w-4xl px-6 py-8">
            <h1 className="font-display text-3xl tracking-tight font-semibold text-ink">
              Am I Ready?
            </h1>
            <p className="mt-2 max-w-2xl text-base leading-7 text-muted">
              Paste a job description and see your match percentage against the target role&apos;s skill
              graph, broken down by individual skill.
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-4xl px-6 py-8">
          <MatchScoreCard />
        </div>
      </main>
    </>
  );
}
