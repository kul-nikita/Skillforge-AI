import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getMastery } from "@/lib/db/learners";
import { findResourcesByIds } from "@/lib/db/resources";
import { gateResources, getSkillGraph } from "@/lib/graph/queries";
import { searchResources } from "@/lib/vector/search";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  query: z.string().min(3).max(300),
  limit: z.number().int().min(1).max(25).default(10)
});

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Enter at least a few words to search for." }, { status: 400 });
  }

  try {
    // Qdrant widens the pool from free-text phrasing.
    const hits = await searchResources(parsed.data.query, parsed.data.limit);

    if (hits.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const mastery = await getMastery(user.id);
    const ids = hits.map((hit) => hit.resourceId);

    // Neo4j decides what the learner is ready for; Mongo supplies the metadata.
    const [gates, resources, graph] = await Promise.all([
      gateResources(ids, mastery),
      findResourcesByIds(ids),
      getSkillGraph()
    ]);

    const gateById = new Map(gates.map((gate) => [gate.resourceId, gate]));
    const resourceById = new Map(resources.map((resource) => [resource.id, resource]));
    const skillName = new Map(graph.skills.map((skill) => [skill.id, skill.name]));

    const results = hits
      .map((hit) => {
        const resource = resourceById.get(hit.resourceId);
        const gate = gateById.get(hit.resourceId);
        if (!resource || !gate) {
          return null;
        }

        return {
          resource,
          similarity: Number(hit.similarity.toFixed(3)),
          // Blocked items are shown with a reason rather than hidden, so
          // sequencing is visible instead of feeling like missing results.
          ready: gate.unmetPrerequisites.length === 0,
          unmetPrerequisites: gate.unmetPrerequisites.map((id) => skillName.get(id) ?? id),
          teaches: gate.teaches.map((id) => skillName.get(id) ?? id)
        };
      })
      .filter(Boolean);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("[search] failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Search is unavailable right now." }, { status: 502 });
  }
}
