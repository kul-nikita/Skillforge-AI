# Flow coherence and real adaptivity

**Date:** 2026-09-09
**Status:** approved, phase 1 in progress

## Problem

The product asks the learner for the same thing twice and then ignores what they
said the first time. It also describes itself as AI-driven while the one screen
where a learner has questions — the diagnostic — contains no model call at all.
Four defects, all verified in the code rather than inferred:

1. **The diagnostic re-asks for the target role.** `components/DiagnosticFlow.tsx`
   initialises `roleId` to `null` and renders `RolePicker`, even though the page
   passes `defaultRoleId` from the stored profile. The learner's onboarding
   choice is reduced to a highlighted suggestion.
2. **The diagnostic ignores the stored budget.** `WEEKLY_HOURS = 8` and
   `PREFERENCES = { maxHoursPerStep: 2, cost: "free", format: "lab" }` are
   module constants used for both the roadmap call and "Plan this week". A
   learner who said "2 hours a week, paid is fine" at onboarding gets a week
   planned for 8 hours of free labs. This is not only redundant questioning —
   the first answer is discarded.
3. **"Why" stops at a label.** `buildGapReason` in `lib/planner/roadmap.ts`
   returns `Build prerequisite evidence first: <names>.` It names the blocker
   but never says what evidence established it or what it implies about where
   the learner stands.
4. **A second diagnostic shows nothing.** Events are append-only, so the
   difference between two diagnostics is computable. Nothing computes it, so
   re-running one produces a screen indistinguishable from the first run.

A fifth issue is placement rather than absence: a grounded mentor that answers
questions about the learner's own state exists (`components/MentorPanel.tsx`)
but sits at the bottom of the dashboard, so the product reads as "numbers with
a chatbot bolted on" — the exact thing `CLAUDE.md` claims it is not.

## Decisions

Three forks were settled with the user before design:

- **Diagnostic questions are model-generated per learner**, with the existing
  288-question bank as the fallback path.
- **Onboarding takes natural language for timeline and weekly hours**, echoing
  the parsed number back so it stays correctable.
- **Sequencing: coherence first, then AI.**

### Deliberate departure from product rule 5

`CLAUDE.md` lists "learner data is only analyzed after explicit consent" as a
non-negotiable rule, and the consent checkbox is being removed at the user's
explicit instruction. The mitigation is that consent stops being a per-session
toggle and becomes a condition of having an account: the statement moves to
signup, `consentGiven` is set true when a profile is saved, and export and
delete remain available at `/account`. The rule's substance — the learner is
told, and can withdraw by deleting — is preserved; the mid-flow choice is not.
This is recorded here because a silent removal would make the rule a lie.

## Phase 1 — coherence

**1. The diagnostic reads the profile it was given.**
`app/diagnostic/page.tsx` passes the whole profile. `DiagnosticFlow` starts at
`profile.targetRoleId` with no picker and offers "Change target role" linking to
`/onboarding`. With no profile, redirect to `/onboarding` — the pattern
`/gap-analyzer` and `/match-score` already use.

**2. The stored budget is the only budget.**
Delete `WEEKLY_HOURS` and `PREFERENCES`. Both the diagnostic roadmap call and
`WeekPlanner` read `profile.weeklyHours` and `profile.preferences`.

**3. Consent always on.**
Remove the checkbox from `OnboardingFlow` and `ManualSetup`; send
`consentGiven: true`. Add the statement to signup. The diagnostic states in one
line that results are saved.

**4. Natural-language timeline and hours.**
The review screen takes phrases. Parsing reuses the existing intent extraction
rather than adding a second prompt surface, and renders "→ understood as 21
weeks". If the model is unavailable, the numeric input remains as the fallback,
so onboarding never becomes model-dependent. `describeFit` continues to run on
the parsed numbers.

## Phase 2 — adaptivity

**5. Model-written diagnostic questions.**
`lib/llm/diagnostic-questions.ts` generates the next question from the target
role, `experienceLevel`, `currentSkills`, and answers so far. Graded
server-side on a rubric, bound with the issued-question HMAC in
`lib/crypto/tokens.ts` so a learner cannot submit and be graded on questions
they wrote. **Which skill to probe next stays in the planner** — sequencing is
never delegated to the model (product rule 2). Bank fallback on any model
failure, so the demo runs offline.

**6. Explanations carry evidence.**
The `/api/explain` fact pack gains the diagnostic answers behind the current
mastery, the prerequisite chain with each link's mastery, and the downstream
skills unlocked. The grounding guard is unchanged: invented URLs, prices and
out-of-set numbers are still discarded.

**7. Prerequisites say what they signify.**
`buildGapReason` returns structured data — each blocker with its mastery and the
evidence that produced it — so the UI can render "Networking Fundamentals, 30%:
2 of 3 subnetting questions missed; gates 4 later skills" instead of a bare
list. The sentence form stays available for callers that want prose.

**8. The mentor is reachable from every screen** that can seed it with context,
not only the dashboard.

**9. A repeat diagnostic renders a delta** computed from the event log:
per-skill movement, newly unlocked skills, readiness change. No movement is a
valid outcome and is displayed as one rather than hidden.

## Testing

- Unit: phrase→number parsing, the diagnostic delta, the new gap-reason shape,
  and the fit panel's continued behaviour on parsed values.
- Live: a full run — onboarding in natural language, diagnostic without a second
  role pick, a week plan honouring the stated budget, a repeat diagnostic
  showing movement.

## Out of scope

The wizard restructure of onboarding; moving the question bank into Mongo; any
change to the scoring formula or the Cypher prerequisite gate.
