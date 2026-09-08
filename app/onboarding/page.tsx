import { listDomains, listRoles } from "@/lib/graph/queries";
import { requireUserOrRedirect } from "@/lib/auth/session";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { SiteHeader } from "@/components/SiteHeader";
import { isAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export const metadata = { title: "Set your goal" };

export default async function OnboardingPage() {
  const user = await requireUserOrRedirect("/onboarding");
  const [roles, domains] = await Promise.all([listRoles(), listDomains()]);

  return (
    <>
      <SiteHeader showAdmin={isAdmin(user)} user={user} />
      <main className="min-h-screen bg-canvas" id="main">
      <div className="mx-auto max-w-2xl px-6 py-14">
        <OnboardingFlow domains={domains} roles={roles} />

        <p className="mt-10 border-t border-border pt-5 text-sm leading-6 text-muted">
          Next: a short adaptive diagnostic — around a dozen questions, six minutes — so your roadmap
          starts from what you actually know rather than from zero.
        </p>
      </div>
      </main>
    </>
  );
}
