# Architecture

Detail referenced from `CLAUDE.md`. This is the ground truth for the data
model, scoring math, and adaptation logic — implement to this spec exactly,
since the whole pitch rests on these being deterministic and explainable.

## System flow

```
Learner goal (natural language)
        │
        ▼
LLM: extract structured intent (role, timeline, weekly hours,
     prior skills, preferences, budget) — JSON only, no free text state changes
        │
        ▼
Adaptive diagnostic (10–15 Qs, branching) → per-skill mastery estimate
        │
        ▼
Skill graph (Neo4j): gap analysis (target skills − mastered skills)
        │
        ▼
Planner: prerequisite-valid ordering of missing skills (deterministic, no LLM)
        │
        ▼
Candidate resources per skill:
  MongoDB tag/filter match (primary)
  + optional Qdrant semantic widening (see below)
  → both filtered back through Neo4j prerequisites before continuing
        │
        ▼
Scoring engine: rank candidates (deterministic formula, no LLM)
        │
        ▼
LLM: generate "why recommended" explanation, grounded ONLY in the
     scored candidate's metadata (never invents facts)
        │
        ▼
Learner acts (start/complete/rate) → event log → mastery update → replan
```

The LLM appears at exactly two points: intent extraction and explanation
generation. Everything between — gap analysis, sequencing, scoring — is
deterministic code. This split is the core defensibility of the product and
should be visible in the codebase, not just the pitch deck.

## Data model

Three stores, one shared ID scheme. Every `Skill`, `Role`, and
`LearningResource` gets a stable string ID (e.g. a slug or UUID) minted once
at seed time and reused identically as a Neo4j node property, a MongoDB
document `_id`/field, and a Qdrant point ID/payload field. Nothing about a
skill or resource's identity should ever be store-specific.

### Neo4j — the graph (structure, mostly static)

Nodes and relationships only — no mutable learner state lives here. This is
what makes prerequisite validation a graph traversal instead of app code
walking arrays.

```cypher
// Nodes
(:Role {id, name, description})
(:Skill {id, name, category, description})
(:Resource {id})            // thin pointer node — full metadata lives in MongoDB
(:Project {id})
(:Assessment {id})

// Relationships
(:Role)-[:REQUIRES {importance}]->(:Skill)
(:Skill)-[:PREREQUISITE_OF]->(:Skill)
(:Resource)-[:TEACHES]->(:Skill)
(:Project)-[:DEMONSTRATES]->(:Skill)
(:Assessment)-[:MEASURES]->(:Skill)
```

Example, for one role:

```cypher
(:Role {name:"Junior SOC Analyst"})
  -[:REQUIRES]-> (:Skill {name:"SIEM Querying"})
  -[:REQUIRES]-> (:Skill {name:"Alert Triage"})
  -[:REQUIRES]-> (:Skill {name:"Incident Documentation"})

(:Skill {name:"Log Fundamentals"})       -[:PREREQUISITE_OF]-> (:Skill {name:"SIEM Querying"})
(:Skill {name:"Linux Fundamentals"})     -[:PREREQUISITE_OF]-> (:Skill {name:"SIEM Querying"})
(:Skill {name:"Networking Basics"})      -[:PREREQUISITE_OF]-> (:Skill {name:"SIEM Querying"})
```

Prerequisite validation for a candidate skill is one traversal: fetch all
`(:Skill)-[:PREREQUISITE_OF]->(target)` nodes, check each against the
learner's MongoDB mastery map. The planner (`lib/planner`) is the only
module allowed to query Neo4j at request time for sequencing decisions.

### MongoDB — learner state + resource catalog (mutable, iterated on daily)

```
learners            { _id, name, email, createdAt }
learner_profile     { learnerId, targetRoleId, timelineWeeks, weeklyHours,
                       preferences: {...}, budget, consentGiven: bool }
mastery             { learnerId, skillId, score: 0-1, updatedAt }
                     // derived from events, see Adaptation section below
learning_resources  { _id, title, provider, url, resourceType,   // video/course/lab/doc/project
                       skillTags: [skillId...], difficulty, durationMinutes,
                       costType, language, qualityScore, isCurated: bool,
                       prerequisites: [skillId...], evidenceType, lastVerifiedAt }
                     // _id here MUST match the corresponding (:Resource {id}) node in Neo4j
events              { _id, learnerId, verb, objectType, objectId,
                       score, durationMinutes, timestamp, metadata: {...} }
                     // append-only, xAPI-inspired: "learner X completed lab Y, score 84"
evidence            { _id, id, learnerId, skillId, resourceId, artifactUrl,
                       evidenceType, rubricScore, validatedCapabilities: [...],
                       createdAt, signature }
                     // signature = HMAC-SHA256 over the record's own fields,
                     // computed at mint time (lib/crypto/signing.ts); the
                     // public /verify/<id> page recomputes and compares it
```

MongoDB is the only store the app writes to at request time for anything
learner-specific — Neo4j and Qdrant are read-mostly once seeded.

### Qdrant — semantic candidate widening (optional layer, additive only)

One collection, `resources`, where each point's ID matches the resource's
Mongo `_id` / Neo4j node ID:

```
point: {
  id: "<resource_id>",
  vector: embedding(title + description + skillTags.join(" ")),
  payload: { skillTags: [...], difficulty, resourceType }   // for pre-filtering
}
```

Used for one thing: when a learner's free-text goal or a gap skill's
description doesn't line up cleanly with existing `skill_tags` (e.g. a
learner says "I want to get good at catching phishing emails" instead of
naming a skill), embed the phrase and do a Qdrant similarity search,
pre-filtered by payload where possible, to surface candidate resources —
which then still have to pass the same Neo4j prerequisite check and MongoDB
hard filters as everything else before they can be scored or shown. Qdrant
never gets to shortcut the graph.

## Recommendation scoring formula

For each candidate resource `r` for a given learner:

```
Score(r) = 0.30 * SkillGapMatch(r)
         + 0.20 * PrerequisiteReadiness(r)
         + 0.15 * Quality(r)
         + 0.15 * LearningPreferenceFit(r)
         + 0.10 * TimeFit(r)
         + 0.10 * CostFit(r)
```

**Hard filters, applied before scoring (a candidate that fails any of these
is dropped, not down-ranked):**
- All of `r.prerequisites` must have `mastery.score >= 0.6` for this learner.
- Skip skills the learner already has `mastery.score >= 0.8` on, unless the
  learner explicitly asks for practice.
- `r.duration_minutes` must fit inside remaining weekly time budget for that
  week's plan.
- Every weekly module includes at least one hands-on/evidence-producing item
  (`evidence_type IS NOT NULL`) — don't let an all-video week pass scoring.

**Component definitions:**
- `SkillGapMatch`: overlap between `r.skill_tags` and the learner's
  currently-highest-priority gap skills (from the planner's ordered gap
  list), weighted by how central that skill is to the target role
  (`role_skills.importance`).
- `PrerequisiteReadiness`: average mastery score across `r.prerequisites`,
  normalized 0–1. Distinct from the hard filter — this rewards *comfortably*
  ready over *barely* ready.
- `Quality`: `r.quality_score`, itself set from provider trust tier (official
  docs / recognized platform > established course provider > general video),
  freshness (`last_verified_at`), and, for the demo catalog, manual curation.
- `LearningPreferenceFit`: match between `r.resource_type`/`format` and the
  learner's stated preferences (hands-on labs, short videos, reading, etc.).
- `TimeFit`: how well `r.duration_minutes` fits the learner's available
  session length this week.
- `CostFit`: match between `r.cost_type` and the learner's stated budget.

The UI's "why recommended" card must render the six component scores, not
just the total — this is what makes the system look (and be) explainable
instead of a black box.

## Adaptation / mastery model

Mastery per skill is a score in [0, 1], derived from the event log — never
hand-set except by the initial diagnostic.

Inputs feeding the derivation: diagnostic answer correctness, quiz accuracy,
reattempt count, lab completion, project rubric score, learner
self-confidence rating, time-to-completion relative to expected, and
explicit feedback ("too easy" / "too hard" / "irrelevant").

MVP update rule (simple, defensible, good enough for a demo):

```
if assessment_score < 0.60:
    insert a foundational remediation resource + small practice lab
    delay dependent (downstream prerequisite) skills
elif 0.60 <= assessment_score <= 0.80:
    retain current plan
    recommend one additional practice task for that skill
elif assessment_score > 0.80 and learner finished early:
    mark skill mastery >= 0.8 (likely mastered)
    unlock next prerequisite-valid module immediately, don't wait for the
    week boundary

if learner marks a resource "not useful":
    lower preference weight for that resource's format/provider
    ask exactly one clarifying question
    re-rank remaining candidates for that gap skill
```

Replanning is triggered by: assessment score crossing a threshold, an
explicit "replan my week" action, or a learner-declared change in available
weekly hours. Replanning re-runs gap analysis + scoring for the affected
skills only — it should not regenerate the whole roadmap from scratch each
time (both for cost and for UX stability).

## Portfolio & readiness surfaces (read-only, additive)

These sit on top of the pipeline above. None of them writes learner state
except the verification interview, which writes through the same
`addEvidence` path as `/api/complete`. All of them take the target role from
the session profile, never the request body.

### Job-description parsing (`lib/llm/jd-parsing.ts`, `/api/jd/parse`)

The chat model extracts skills from pasted JD text under a strict response schema:
`{ name, required, confidence, originalText }` per skill plus `jobTitle` and
`company`. This is the **one place the model originates a term** — a skill
name it read in the posting. It is contained immediately: `matchJDSkillsToGraph`
looks each name up in the Neo4j skill set (case-insensitive exact match), and
anything with no match is reported as "not in your path", never invented into
the graph. Ordering, prerequisites and mastery all still come from the graph
and the event log. Overall match is a confidence- and importance-weighted
ratio of demonstrated to required skills — the same shape as the scoring
formula, not a model judgement.

### Match score (`computeRoleMatchScore`, `/api/match-score`)

No model call. For each of the role's `REQUIRES` skills:
`status = mastered (≥0.8) | partial (≥0.6) | missing`, and
`overall = Σ(mastery · importance) / Σ(importance)`. It is the dashboard's
readiness number with a per-skill breakdown attached.

### Readiness prediction (`lib/prediction/timeline.ts`)

No model call. Projects weeks-to-job-ready from remaining gap hours and the
learner's stated `weeklyHours`, adjusted by observed pace from the event log,
and emits a per-week series with a confidence band (`lower`/`upper`) and a
job-ready line at 80%. Recomputed on every dashboard load, so it moves as the
event log grows.

### Verification interview (`lib/llm/interview.ts`, `/api/interview`)

An alternative post-check. The chat model generates five scenario questions for the
skill and, on submission, grades each answer 0–1 on accuracy and depth
(structured output). Grading is server-side; the questions carry no answer
key to the client. A mean ≥ 0.5 mints a `verification-interview` evidence
record — higher-confidence than the multiple-choice post-check because the
answers are free prose, but still not self-reported.

### Evidence signature (`lib/crypto/signing.ts`)

`addEvidence` computes `HMAC-SHA256(EVIDENCE_SIGNING_SECRET, canonical(record))`
at mint time and stores it as `signature`. `serializeEvidence` fixes field
order so the hash is stable. The public `/verify/<id>?sig=…` page recomputes
it and reports intact / altered. A missing secret falls back to a well-known
dev key (like `CEREBRAS_API_KEY`, not like `MONGODB_URI`) so completion never
breaks locally — set a real value wherever a shared link must be unforgeable.

## Resource sourcing

**Layer 1 (build first, must work standalone for the demo): curated
catalog.** 30–100 hand-verified rows in `learning_resources`, covering the
three target roles: Junior SOC Analyst, Junior Penetration Tester, Cloud
Security Associate. Every row needs a real working URL, correct
`skill_tags`, `prerequisites`, `difficulty`, `duration_minutes`, `cost_type`,
and `evidence_type`. This is what the demo runs on — do not let it depend on
network calls at demo time.

**Layer 2 (optional stretch): live discovery**, constrained to an allowlist
of trusted domains so results stay credible and explainable:

```
site:portswigger.net/web-security
site:learn.microsoft.com
site:tryhackme.com
site:academy.hackthebox.com
site:owasp.org
site:freecodecamp.org
site:docs.aws.amazon.com
```

Candidates from live search go through the same normalization →
hard-filter → scoring pipeline as curated resources before they can ever be
shown to a learner. The LLM never surfaces a URL it found itself outside
this pipeline.

Good source coverage by type, for building the seed catalog:

| Source | Use | Notes |
|---|---|---|
| TryHackMe | hands-on labs | strong `evidence_type: lab_completion` |
| Hack The Box Academy | advanced modules | good for pentest path |
| PortSwigger Web Security Academy | web-security labs | free, high trust |
| Microsoft Learn | cloud/security paths | good for cloud security associate |
| AWS Skill Builder | cloud content | pair with Microsoft Learn for breadth |
| Cisco Networking Academy | networking foundations | early-phase prerequisite content |
| OWASP | reference docs | high trust, low-cost quality signal |
| freeCodeCamp | free structured courses | good beginner-tier content |
| YouTube (specific trusted channels) | quick concept videos | keep to a short allowlist of channels, not open search |
| GitHub | project templates, practice repos | evidence-producing project briefs |

## Production stack notes (post-hackathon scale-up path)

If this goes beyond the hackathon: move the `events` collection to an
xAPI-compliant Learning Record Store rather than a custom Mongo collection;
separate the Next.js monolith into a FastAPI (or NestJS) backend if the team
wants LangGraph-style orchestration for the LLM layer; add caching (e.g.
Redis) in front of Neo4j for hot prerequisite lookups if traversal latency
becomes visible at scale; move resource discovery from an allowlist crawl to
a licensed provider-catalog integration (Coursera/edX partner APIs) where
terms permit. The Neo4j / MongoDB / Qdrant split itself is already the
scale-appropriate architecture — it doesn't need replacing, just hardening
(managed clusters instead of free tiers, backups, access control per
learner's own data).

## Operational notes for this stack

- **Seed order matters:** Neo4j (graph) → MongoDB (resources + profiles,
  since resource docs reference skill IDs the graph just defined) → Qdrant
  (embeddings, since points reference resource IDs Mongo just created).
  `npm run db:seed:all` runs them in this order — don't run seed scripts
  independently out of order during development.
- **Neo4j is read-mostly at runtime.** The only writes after seeding should
  be admin/content-team edits to the graph (adding a skill, changing a
  prerequisite) — never a per-learner write. If you find yourself writing a
  learner-specific node/relationship into Neo4j, that data belongs in
  MongoDB instead.
- **Qdrant is additive, never load-bearing for correctness.** The demo must
  work with Qdrant offline — semantic widening improves recall, it isn't a
  dependency for the core scoring pipeline. Build and test the MongoDB
  tag-match path first; add Qdrant last.
- **Local dev:** Neo4j and Qdrant both have official Docker images
  (`neo4j:latest`, `qdrant/qdrant`) — use `docker-compose.yml` for local dev
  against a MongoDB Atlas free-tier cluster (Mongo's local binary is heavier
  to keep in sync with Atlas-specific features like Atlas Search, so it's
  usually less friction to just point dev at a free Atlas cluster too).