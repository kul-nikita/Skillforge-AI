import { redirect } from "next/navigation";
import { GapAnalysis } from "@/components/GapAnalysis";
import { SiteHeader } from "@/components/SiteHeader";
import { requireUserOrRedirect } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import { getProfile } from "@/lib/db/learners";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Job Description Gap Analyzer"
};

export default async function GapAnalyzerPage() {
  const user = await requireUserOrRedirect("/gap-analyzer");
  const profile = await getProfile(user.id);

  if (!profile?.targetRoleId) {
    redirect("/onboarding");
  }

  return (
    <>
      <SiteHeader current="/gap-analyzer" showAdmin={isAdmin(user)} user={user} />
      <main className="min-h-screen bg-canvas">
        <section className="border-b border-border bg-surface">
          <div className="mx-auto max-w-4xl px-6 py-8">
            <h1 className="font-display text-3xl tracking-tight font-semibold text-ink">
              Job Description Gap Analyzer
            </h1>
            <p className="mt-2 max-w-2xl text-base leading-7 text-muted">
              Paste a real job posting. We&apos;ll extract the required skills, map them against your
              learning path, and show exactly what you&apos;re missing.
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-4xl px-6 py-8">
          <GapAnalysis />
        </div>
      </main>
    </>
  );
}
