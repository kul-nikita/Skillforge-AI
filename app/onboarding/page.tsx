import { listRoles } from "@/lib/graph/queries";
import { requireUserOrRedirect } from "@/lib/auth/session";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { SiteHeader } from "@/components/SiteHeader";
import { isAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export const metadata = { title: "Set your goal" };

export default async function OnboardingPage() {
  const user = await requireUserOrRedirect("/onboarding");
  const roles = await listRoles();

  return (
    <>
      <SiteHeader showAdmin={isAdmin(user)} user={user} />
      <main className="min-h-screen bg-canvas" id="main">
      <div className="mx-auto max-w-2xl px-6 py-14">
        <p className="text-sm font-medium text-muted">Step 1 of 4 · about a minute</p>

        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink">
          What are you aiming for?
        </h1>

        <p className="mt-3 text-base leading-7 text-muted">
          Describe it in your own words — a sentence is enough. If something important is missing
          we&apos;ll ask, rather than guess, and you see exactly what we understood before anything is
          saved.
        </p>

        <OnboardingFlow roles={roles} />

        <p className="mt-10 border-t border-border pt-5 text-sm leading-6 text-muted">
          Next: a short adaptive diagnostic — around a dozen questions, six minutes — so your roadmap
          starts from what you actually know rather than from zero.
        </p>
      </div>
      </main>
    </>
  );
}
