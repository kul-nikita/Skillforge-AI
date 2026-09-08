import type { Evidence, MasteryMap } from "@/lib/types";

/**
 * Sample wallet for the demo learner. `artifactUrl` is null because nobody
 * has uploaded anything — the UI says so rather than linking somewhere fake.
 */
export const demoEvidence: Evidence[] = [
  {
    id: "ev-linux-bandit",
    learnerId: "demo-learner",
    skillId: "linux-fundamentals",
    resourceId: "overthewire-bandit",
    summary: "Completed levels 0–14 of a shell wargame and documented each escalation step.",
    evidenceType: "linux-command-log",
    artifactUrl: null,
    rubricScore: 0.88,
    validatedCapabilities: [
      "Navigate an unfamiliar filesystem from the shell",
      "Read and reason about file permissions and ownership",
      "Chain command-line tools to extract a specific value"
    ],
    createdAt: "2026-07-14",
    signature: "demo-signature-linux-bandit"
  },
  {
    id: "ev-log-bruteforce",
    learnerId: "demo-learner",
    skillId: "log-analysis",
    resourceId: "ms-audit-logon-events",
    summary: "Investigated an SSH brute-force simulation and separated true from false positives.",
    evidenceType: "log-triage-writeup",
    artifactUrl: null,
    rubricScore: 0.84,
    validatedCapabilities: [
      "Identify anomalous login patterns across a log window",
      "Distinguish a brute-force burst from normal service account noise",
      "Write a remediation recommendation an on-call engineer can act on"
    ],
    createdAt: "2026-07-28",
    signature: "demo-signature-log-bruteforce"
  },
  {
    id: "ev-siem-detections",
    learnerId: "demo-learner",
    skillId: "siem-querying",
    resourceId: "splunk-search-tutorial",
    summary: "Authored three detection queries against sample event data and tuned one for false positives.",
    evidenceType: "siem-query-screenshot",
    artifactUrl: null,
    rubricScore: 0.79,
    validatedCapabilities: [
      "Aggregate events into counts grouped by a field",
      "Express a detection idea as an executable query",
      "Tune a noisy rule using baseline context instead of disabling it"
    ],
    createdAt: "2026-08-11",
    signature: "demo-signature-siem-detections"
  }
];

export const demoLearnerMastery: MasteryMap = {
  "networking-basics": 0.82,
  "linux-fundamentals": 0.58,
  "log-analysis": 0.22,
  "siem-querying": 0.12,
  "alert-triage": 0.05,
  "mitre-attack": 0,
  "incident-documentation": 0.18
};
