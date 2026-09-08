import { SkillGraphExplorer } from "@/components/SkillGraphExplorer";
import { SiteHeader } from "@/components/SiteHeader";
import { requireUserOrRedirect } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import { getProfile, getMastery } from "@/lib/db/learners";
import { getSkillGraph, listRoles } from "@/lib/graph/queries";
import { findResourcesByIds } from "@/lib/db/resources";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Skill Graph Explorer"
};

export default async function GraphPage() {
  const user = await requireUserOrRedirect("/graph");
  const [profile, mastery, graph, roles] = await Promise.all([
    getProfile(user.id),
    getMastery(user.id),
    getSkillGraph(),
    listRoles()
  ]);

  const roleId = profile?.targetRoleId ?? roles[0]?.id;
  const role = roles.find((r) => r.id === roleId);
  const requiredSkillIds = role?.requiredSkills.map((rs) => rs.skillId) ?? [];

  const allSkillIds = graph.skills.map((s) => s.id);
  const resources = await findResourcesByIds([]); // We'll filter by skill tags later

  const nodes = graph.skills.map((skill) => ({
    data: {
      id: skill.id,
      label: skill.name,
      mastery: mastery[skill.id] ?? 0,
      category: skill.category,
      description: skill.description,
      resourceCount: 0, // Will be computed from resources
      isRequired: requiredSkillIds.includes(skill.id)
    }
  }));

  const edges = graph.skills.flatMap((skill) =>
    skill.prerequisites.map((prereqId) => ({
      data: { source: prereqId, target: skill.id }
    }))
  );

  const graphData = {
    nodes,
    edges,
    skills: graph.skills,
    mastery,
    resources,
    requiredSkillIds
  };

  return (
    <>
      <SiteHeader current="/graph" showAdmin={isAdmin(user)} user={user} />
      <main className="min-h-screen bg-canvas">
        <section className="border-b border-border bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-8">
            <h1 className="font-display text-3xl tracking-tight font-semibold text-ink">
              Skill Graph Explorer
            </h1>
            <p className="mt-2 max-w-2xl text-base leading-7 text-muted">
              Visualize the entire skill tree for your role. Nodes are colored by mastery level.
              Click any node to see prerequisites, resources, and progress.
            </p>
            {role && (
              <p className="mt-2 text-sm text-teal">
                Showing skills for: <span className="font-semibold">{role.title}</span>
              </p>
            )}
          </div>
        </section>

        <div className="mx-auto max-w-6xl px-6 py-8">
          <SkillGraphExplorer data={graphData} />
        </div>
      </main>
    </>
  );
}
