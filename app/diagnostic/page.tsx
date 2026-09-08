import { redirect } from "next/navigation";
import { getRole } from "@/lib/graph/queries";
import { getProfile } from "@/lib/db/learners";
import { requireUserOrRedirect } from "@/lib/auth/session";
import { DiagnosticFlow } from "@/components/DiagnosticFlow";
import { SiteHeader } from "@/components/SiteHeader";
import { isAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export const metadata = { title: "Diagnostic" };

export default async function DiagnosticPage() {
  const user = await requireUserOrRedirect("/diagnostic");
  const profile = await getProfile(user.id);

  // The diagnostic is scored against a target role, so there is nothing to run
  // without one. Same redirect /gap-analyzer and /match-score already use.
  if (!profile?.targetRoleId) {
    redirect("/onboarding");
  }

  const role = await getRole(profile.targetRoleId);

  if (!role) {
    redirect("/onboarding");
  }

  return (
    <>
      <SiteHeader current="/diagnostic" showAdmin={isAdmin(user)} user={user} />
      <main id="main">
        <DiagnosticFlow
          canPersist={user.consentGiven}
          roleTitle={role.title}
          targetRoleId={profile.targetRoleId}
          weeklyHours={profile.weeklyHours}
        />
      </main>
    </>
  );
}
