/**
 * Seeds the two accounts the demo run-of-show needs, and nothing else.
 *
 * Everything goes in through the same functions the app uses — `createUser`,
 * `hashPassword`, `appendEvents`, `addEvidence` — so the result is a genuine
 * learner state rather than a hand-written fixture: mastery is derived from the
 * event log by the real deriver, and evidence carries a real HMAC that
 * `/verify/<id>` recomputes. Writing rows straight into Mongo would produce a
 * demo that passes visually and fails the moment a judge clicks verify.
 *
 * Re-runnable: both accounts are deleted and rebuilt on every run, so a
 * rehearsal that completes resources can be reset with one command.
 *
 *   npm run demo:seed
 */
import { addEvidence, appendEvents, deleteLearnerData, upsertProfile } from "@/lib/db/learners";
import { createUser, deleteUser, findUserByEmail, setConsent } from "@/lib/db/users";
import { hashPassword } from "@/lib/auth/password";
import type { LearningEvent } from "@/lib/adaptation/mastery";

export const DEMO_EMAIL = "demo.analyst@skillforge.dev";
export const FRESH_EMAIL = "demo.newstarter@skillforge.dev";
/**
 * Admin is an ADMIN_EMAILS allowlist, not a role on the account, so this is
 * only an admin where that env var names it. Kept separate from the learner
 * account so the demo learner's header does not carry a "Catalog admin" link
 * a judge would reasonably ask about.
 */
export const ADMIN_EMAIL = "demo.curator@skillforge.dev";
export const DEMO_PASSWORD = "ForgeDemo2026!";

/**
 * The ladder's own estimates, so the diagnostic screen and these numbers tell
 * the same story: 0.9 = advanced answered correctly, 0.7 = intermediate only,
 * 0.4 = beginner only, 0.1 = missed the intermediate and the beginner.
 *
 * Shaped to leave the demo with something to show at every stage: two skills
 * comfortably evidenced, one mid, and three open — including one whose
 * prerequisites are not met, so the roadmap has a blocked entry to explain.
 */
const DIAGNOSTIC: Record<string, number> = {
  "networking-basics": 0.9,
  "linux-fundamentals": 0.9,
  "web-security-basics": 0.7,
  "burp-suite": 0.4,
  "sql-injection": 0.1,
  "pentest-reporting": 0.1
};

/** Completed work, which is what moves mastery past the diagnostic. */
const COMPLETIONS = [
  {
    skillId: "networking-basics",
    resourceId: "professormesser-comptia-n10-009-network-training-course",
    verb: "quiz_completed" as const,
    score: 0.92,
    summary: "Worked through the Network+ course and passed the post-check on subnetting and DNS.",
    evidenceType: "networking-notes",
    capabilities: ["Reads a subnet mask", "Traces a DNS resolution", "Explains TCP vs UDP"],
    daysAgo: 12
  },
  {
    skillId: "linux-fundamentals",
    resourceId: "overthewire-bandit",
    verb: "lab_completed" as const,
    score: 0.88,
    summary: "Cleared Bandit levels 0-15 and wrote up the commands used at each step.",
    evidenceType: "linux-command-log",
    capabilities: ["Navigates a filesystem from the shell", "Uses find and grep under pressure"],
    daysAgo: 6
  },
  {
    skillId: "web-security-basics",
    resourceId: "portswigger-web-security-getting-started",
    verb: "lab_completed" as const,
    score: 0.71,
    summary: "Completed the Web Security Academy introduction labs; access-control labs still open.",
    evidenceType: "vulnerability-writeup",
    capabilities: ["Identifies a reflected XSS sink"],
    daysAgo: 2
  }
];

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Remove the account and everything attached to it, so a re-run is clean. */
async function wipe(email: string) {
  const existing = await findUserByEmail(email);
  if (!existing) return;

  // The same path /account uses to honour a delete request.
  await deleteLearnerData(existing.id);
  await deleteUser(existing.id);
}

async function main() {
  await Promise.all([wipe(DEMO_EMAIL), wipe(FRESH_EMAIL), wipe(ADMIN_EMAIL)]);

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // The fresh account exists only so onboarding can be demonstrated without
  // signing someone up on stage. No profile, no events, nothing.
  const fresh = await createUser(FRESH_EMAIL, passwordHash);
  await setConsent(fresh.id, true);

  const curator = await createUser(ADMIN_EMAIL, passwordHash);
  await setConsent(curator.id, true);

  const learner = await createUser(DEMO_EMAIL, passwordHash);
  await setConsent(learner.id, true);

  await upsertProfile({
    learnerId: learner.id,
    targetRoleId: "pentester",
    careerObjective: "Move from IT support into application security testing",
    experienceLevel: "intermediate",
    currentSkills: ["Python", "Linux command line", "Wireshark"],
    interests: ["web application testing", "bug bounty"],
    learningHistory: ["A university networking module", "OverTheWire Bandit"],
    preferredTechnologies: ["Burp Suite", "Python"],
    learningStyle: "hands-on",
    timelineWeeks: 16,
    weeklyHours: 6,
    preferences: { maxHoursPerStep: 2, cost: "free", format: "lab" },
    consentGiven: true
  });

  const events: LearningEvent[] = Object.entries(DIAGNOSTIC).map(([skillId, score]) => ({
    learnerId: learner.id,
    verb: "diagnostic_answered",
    objectType: "skill",
    objectId: skillId,
    skillId,
    score,
    timestamp: daysAgo(21)
  }));

  for (const completion of COMPLETIONS) {
    events.push({
      learnerId: learner.id,
      verb: completion.verb,
      objectType: "resource",
      objectId: completion.resourceId,
      skillId: completion.skillId,
      score: completion.score,
      timestamp: daysAgo(completion.daysAgo)
    });
  }

  await appendEvents(events);

  // Real signatures: these are what /verify recomputes.
  for (const completion of COMPLETIONS) {
    await addEvidence({
      learnerId: learner.id,
      skillId: completion.skillId,
      resourceId: completion.resourceId,
      summary: completion.summary,
      evidenceType: completion.evidenceType,
      // Never a fabricated link — the learner has not uploaded one.
      artifactUrl: null,
      rubricScore: completion.score,
      validatedCapabilities: completion.capabilities,
      createdAt: daysAgo(completion.daysAgo)
    });
  }

  console.log(`Seeded ${DEMO_EMAIL} (${events.length} events, ${COMPLETIONS.length} evidence items)`);
  console.log(`Seeded ${FRESH_EMAIL} (no profile — for demonstrating onboarding)`);
  console.log(`Seeded ${ADMIN_EMAIL} (admin only where ADMIN_EMAILS names it)`);
  console.log(`Password for all three: ${DEMO_PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
