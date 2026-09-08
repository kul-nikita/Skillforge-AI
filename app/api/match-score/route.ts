import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { computeRoleMatchScore } from "@/lib/llm/jd-parsing";
import { getSkillGraph, getRole } from "@/lib/graph/queries";
import { getMastery, getProfile } from "@/lib/db/learners";

export const dynamic = "force-dynamic";

export async function POST() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Scored against the learner's own target role, read from the session
  // profile — never a role id handed in by the caller.
  const roleId = (await getProfile(user.id))?.targetRoleId;

  if (!roleId) {
    return NextResponse.json(
      { error: "No target role set. Complete onboarding first." },
      { status: 400 }
    );
  }

  const [role, graph, mastery] = await Promise.all([
    getRole(roleId),
    getSkillGraph(),
    getMastery(user.id)
  ]);

  if (!role) {
    return NextResponse.json({ error: `Unknown role: ${roleId}` }, { status: 404 });
  }

  const matchScore = computeRoleMatchScore(role, graph, mastery);

  return NextResponse.json(matchScore);
}
