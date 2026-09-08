import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getProfile, getMastery, listEvents } from "@/lib/db/learners";
import { getSkillGraph, getRole } from "@/lib/graph/queries";
import { predictTimeline, readinessFor } from "@/lib/prediction/timeline";

export const dynamic = "force-dynamic";

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const [profile, mastery, events, graph] = await Promise.all([
    getProfile(user.id),
    getMastery(user.id),
    listEvents(user.id),
    getSkillGraph()
  ]);

  const roleId = profile?.targetRoleId;
  if (!roleId) {
    return NextResponse.json(
      { error: "No target role set. Complete onboarding first." },
      { status: 400 }
    );
  }

  const role = await getRole(roleId);
  if (!role) {
    return NextResponse.json({ error: `Unknown role: ${roleId}` }, { status: 404 });
  }

  const prediction = predictTimeline({
    profile,
    mastery,
    role,
    graph,
    events
  });

  return NextResponse.json({
    role: { id: role.id, title: role.title },
    prediction,
    currentReadiness: readinessFor(role, mastery)
  });
}
