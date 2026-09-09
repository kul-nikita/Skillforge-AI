import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { parseJobDescription, matchJDSkillsToGraph } from "@/lib/llm/jd-parsing";
import { getSkillGraph, getRole } from "@/lib/graph/queries";
import { getMastery, getProfile, listEvents } from "@/lib/db/learners";
import { projectMasteryAfterPath, requirementsPathWontCover } from "@/lib/planner/path-projection";
import { predictTimeline } from "@/lib/prediction/timeline";
import { LlmError } from "@/lib/llm/client";

export const dynamic = "force-dynamic";

// The role is never taken from the body: the gap analysis is always against
// the learner's own target role, which lives in their profile.
const requestSchema = z.object({
  jdText: z.string().min(50).max(10000)
});

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { jdText } = parsed.data;
  const profile = await getProfile(user.id);
  const roleId = profile?.targetRoleId;

  // The graph is needed before parsing, not after: the model maps each posting
  // requirement onto a real skill id, so it has to be told which ids exist.
  const graph = await getSkillGraph();

  // Parse the JD with the chat model
  let jdResult;
  try {
    jdResult = await parseJobDescription(jdText, graph.skills);
  } catch (error) {
    if (error instanceof LlmError) {
      console.error("[jd/parse] model call failed:", error.message);
      return NextResponse.json(
        { error: "Could not read that job description right now. Try again in a moment." },
        { status: 502 }
      );
    }
    throw error;
  }

  // If roleId provided, also do the gap analysis
  if (roleId) {
    const [role, mastery] = await Promise.all([getRole(roleId), getMastery(user.id)]);

    if (!role) {
      return NextResponse.json({ error: `Unknown role: ${roleId}` }, { status: 404 });
    }

    const gapAnalysis = matchJDSkillsToGraph(jdResult.skills, graph, mastery, role);

    // The same posting, scored against the mastery the recommended path would
    // leave the learner holding. Deterministic — no second model call, and the
    // JD parse is reused rather than repeated.
    const afterPath = matchJDSkillsToGraph(
      jdResult.skills,
      graph,
      projectMasteryAfterPath(mastery, role),
      role
    );

    const events = await listEvents(user.id);

    return NextResponse.json({
      ...jdResult,
      gapAnalysis,
      projection: {
        overallMatch: afterPath.overallMatch,
        requiredMatch: afterPath.requiredMatch,
        // Named rather than hidden: the path covers the target role, so a
        // posting that asks for more than the role stays short afterwards.
        wontCover: requirementsPathWontCover(gapAnalysis.matched, role),
        weeks: predictTimeline({ profile, mastery, role, graph, events }).expected
      },
      role: { id: role.id, title: role.title }
    });
  }

  return NextResponse.json(jdResult);
}
