# SkillForge AI

**Know what to learn next — and be able to prove you learned it.**

SkillForge turns a stated goal ("become a junior SOC analyst in 12 weeks") into
an adaptive, prerequisite-aware learning path built from real resources on the
internet, and converts every completed step into verifiable portfolio evidence.

**Live:** https://skillforge-gilt.vercel.app

---

## Why this is not a course list with a chatbot bolted on

Three design decisions, each enforced in code rather than promised in a prompt.

### 1. Sequencing is a graph traversal, not a model's opinion

A skill can never be recommended before what it depends on. This is a Cypher
query against Neo4j that walks the **full transitive** prerequisite chain and
filters by the learner's mastery inside the query — not app-level recursion, and
never model judgement.

The gate is the load-bearing piece, so it is pinned by `npm run graph:verify`
against the live database (vitest cannot reach Cypher).

### 2. The LLM explains; it never supplies a fact

Gemini parses goals and writes prose. It cannot originate a URL, price,
duration, rating or certificate name — those come only from the catalog.

This is not left to prompt instructions. `/api/explain` recomputes the facts
server-side, asks for prose, then runs `findGroundingViolations` over the reply.
Output naming a URL or bare domain, a price, a certification, or **any number
outside a narrow allowed set** is discarded and a deterministic sentence is
shown instead — and the UI says which one you are reading. With no API key it
falls back silently, so the product still works offline.

### 3. Evidence, not completion badges

Finishing a resource is not a checkbox. It opens a short post-check drawn from
the same server-side question bank as the diagnostic; the answer key never
reaches the browser, so a learner cannot award themselves mastery. Only the
graded score appends events and mints evidence, and `artifactUrl` stays `null`
unless the learner actually supplied one.

Mastery is a 0–1 score **derived from an append-only event log**, never written
in place — which is what makes a replan explainable after the fact.

---

## From plan to proof

The roadmap is the start. Five surfaces turn it into something a learner can
show a recruiter, and each one keeps the same discipline as the core — the
graph and the catalog supply the facts, the LLM only phrases them.

### Job-description gap analyzer (`/gap-analyzer`)

Paste a real posting. Gemini extracts the skills it names — required vs.
nice-to-have, with a confidence score and the exact phrase each came from — and
the backend maps them onto the target role's skill graph. The model can name a
skill; only the graph decides whether it exists and how it sequences. Output is
your mastery per matched skill, the skills the JD wants that aren't in your
path, and the missing ones in prerequisite order.

### Match score (`/match-score`)

A single readiness percentage against a role's own required-skill set, weighted
by each skill's importance, with a per-skill breakdown (mastered / partial /
missing). No model call — it is the same mastery map the dashboard reads,
scored by a formula you can check.

### Skill graph explorer (`/graph`)

The actual Neo4j prerequisite graph for your role, rendered with Cytoscape,
nodes coloured by mastery. Click a skill for its prerequisites (with your
mastery on each) and the resources that teach it; hover to highlight everything
that must come first.

### Predicted readiness timeline

On the dashboard: weeks-to-job-ready projected from your current pace and
remaining hours, with a confidence band, and a job-ready threshold line at
80%. It recomputes every time you complete a resource — it is a projection of
the event log, not a promise.

### AI verification interview

An alternative to the post-check quiz when finishing a resource: five
scenario questions about the skill, answered in prose, graded server-side on
accuracy and depth. A pass mints a higher-confidence evidence entry
(`verification-interview`) — still server-graded, still not self-reported.

### Verifiable evidence

Every evidence record is signed with an HMAC over its own fields at mint time.
Each card carries a **Copy Share Link** to a public `/verify/<id>?sig=…` page
that recomputes the signature and shows whether the record is intact and
unedited — so the wallet is checkable by someone who was never logged in.

---

## What is in the catalog

| | |
|---|---|
| Domains | 9 |
| Career tracks | 19 |
| Skills | 96 |
| Learning resources | 225 (224 free) |
| Diagnostic questions | 288 |
| Unit tests | 112 |

Cybersecurity · Data & Analytics · Web Development · Cloud & DevOps ·
AI & Machine Learning · UX & Product Design · Product Management ·
Mobile Development · IT Support & Networking

**Every URL was verified HTTP 200 by hand before it was seeded.** That rule
caught eleven dead links and one URL the model had confabulated outright. It is
now machine-enforced: the catalog admin fetches the URL server-side and refuses
to store a row it could not reach, so `lastVerifiedAt` records a check that
actually happened.

> TryHackMe is deliberately absent. It returns HTTP 429 to automated requests
> even for rooms that do not exist, so its links cannot be verified and the
> hand-verification rule cannot be honoured for them.

---

## Architecture

Three stores, each doing the job it is actually good at. The boundary between
them is the same boundary as the product rule: **the graph and the LLM never
share write authority.**

```
 goal text ──▶ Gemini ──▶ structured intent   (role enum built from the graph,
                                               so it cannot invent a role)
                            │
 diagnostic ──▶ events ──▶ mastery            (append-only; mastery is derived)
                            │
                            ▼
   Qdrant  ──widen──▶  Neo4j ──gate──▶  Mongo ──▶  deterministic scoring ──▶ UI
  (ranking)         (prerequisites)   (metadata)     (6 named components)
```

| Store | Owns | Notes |
|---|---|---|
| **Neo4j** | the *shape* of learning — what requires what | Read-mostly at runtime. The prerequisite gate lives here. |
| **MongoDB** | the *state* of a learner — profile, events, mastery, evidence — plus resource metadata | Flexible schema, frequently edited. |
| **Qdrant** | *semantic matching* | Widens the candidate pool before the hard filters. **It can rank; it can never unlock.** |

Search results that fail the gate are shown as **blocked, with the specific
missing prerequisite named**, rather than hidden — sequencing should be visible,
not feel like missing results.

**Stack:** Next.js 15 (App Router, TypeScript) · Tailwind · Cytoscape (skill
graph) · Recharts (readiness timeline) · Neo4j AuraDB · MongoDB Atlas · Qdrant
Cloud · Gemini (`gemini-2.5-flash`, `gemini-embedding-001` @ 768 dims, plain
`fetch`, no SDK) · Vercel.

The signed-in app renders on a single dark theme driven by semantic Tailwind
tokens (`surface`, `canvas`, `ink`, `muted`, `border`, `teal`) — a page follows
the theme by using the tokens, not by carrying its own colours.

---

## Auth and privacy

- Email + password with **scrypt** (`node:crypto`, per-user salt, constant-time
  compare). No auth dependency.
- Sessions are server-side in Mongo storing only a **SHA-256 of the token**, so
  a database leak yields no usable sessions.
- Login is throttled per email, and the failure message is identical for a wrong
  password and an unknown account, so the endpoint cannot enumerate users.
- `middleware.ts` does the cheap cookie-presence redirect only — it runs on Edge
  and cannot reach Mongo. The real check is `requireUserOrRedirect()` in pages
  and `requireUser()` in API routes, so a forged or revoked cookie is rejected
  there.
- Learner identity always comes from the session, never from the request body.
- **Consent and reversibility** (`/account`): nothing is analysed or stored
  without explicit consent, and a learner can export everything as JSON or
  delete their account, which also revokes every session.

### Admin access

There is no separate admin account type and no shared admin password. `/admin`
and `/api/admin/*` check the email on your ordinary session against the
`ADMIN_EMAILS` allowlist (`lib/auth/admin.ts`); **unset means nobody is an
admin**, so the catalog is closed by default. A non-admin gets `403` from the
API and `404` from the page — it does not advertise that it exists.

The demo curator account is **`admin@skillforge.dev`**. Its password is not
committed: this repository is public, and the admin surface writes MongoDB,
Neo4j and Qdrant in one action, including deletes. Ask a maintainer for it, or
make your own admin in two steps:

```bash
# 1. add the address to the allowlist, then restart the server
ADMIN_EMAILS=you@example.com

# 2. sign up with that same address at /signup — the account is now an admin
```

The allowlist lives in `.env` locally and in the hosting provider's environment
variables in production; changing it takes effect on the next restart. Passwords
are scrypt hashes with a per-user salt, so a forgotten one cannot be recovered —
and there is **no reset flow**, which is a real gap rather than a design
decision.

---

## Running it

Node 20 or newer.

```bash
npm install
cp .env.example .env     # then fill it in — see the table below
npm run db:seed:all      # graph → mongo → vector, in that order
npm run graph:verify     # assert the prerequisite gate against the live graph
npm run dev
```

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Intent extraction and embeddings. Optional — explanations fall back to deterministic text without it. |
| `MONGODB_URI` | Full `mongodb+srv://` string. |
| `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` | AuraDB. |
| `QDRANT_URL` / `QDRANT_API_KEY` | Qdrant Cloud. |
| `EVIDENCE_SIGNING_SECRET` | HMAC key behind evidence signatures and the issued-question tokens. Optional — a well-known dev key is used when unset, so signatures verify but are not unforgeable. |
| `ADMIN_EMAILS` | Comma-separated emails allowed into `/admin`. **Unset means nobody is an admin** — the catalog is read-only by default. |

Seed order matters: vectors reference resource ids that must exist in Mongo
first.

### Other commands

```bash
npm run test          # 152 unit tests
npm run typecheck
npm run lint
npm run build         # succeeds with no secrets; see below
```

---

## Tests worth knowing about

The suite is not decorative — most of it exists because something broke.

- `lib/data/catalog.test.ts` guards catalog integrity across all nine domains:
  unique ids and URLs, no cross-domain id collisions, no prerequisite cycles, and
  **every role's required skills must be prerequisite-closed**. That last check
  found a modelling bug affecting **9 of 19 roles**: a role could require a skill
  whose prerequisites the role never asked for, so the roadmap said "build X
  first" while never surfacing X as a gap — a dead end.
- `lib/auth/password.test.ts` pins a real vulnerability: `Buffer.from("zz","hex")`
  silently yields an **empty** buffer, so a malformed stored hash made
  `timingSafeEqual` compare two empty buffers and return `true`. **Any password
  would have authenticated.**
- `lib/services/completion.test.ts` asserts a wrong run scores zero, an unknown
  question id is not credited, and evidence is withheld when the post-check fails.
- `lib/diagnostic/engine.test.ts` asserts every seeded role has all three
  question tiers for every required skill — without it, a new domain would end
  the diagnostic early instead of failing loudly.
- `lib/crypto/tokens.test.ts` covers the issued-question tokens that bind both
  graded flows to what the server actually asked. The case that matters:
  submitting a **subset** of the issued questions — answer four, send only the
  one you got right — is rejected.
- `lib/llm/gemini.test.ts` pins the retry policy (a 503 is retried, a 400 is
  not) and that a short `scores` array from the grader is re-shaped rather than
  rendered as `NaN%`.
- `lib/services/catalog-validation.test.ts` covers the SSRF filter on the admin
  URL check: `169.254.169.254` and other private targets are refused before any
  request is made.

---

## Deploying

CI (`.github/workflows/ci.yml`) runs typecheck → lint → tests → build on every
push. **The build step deliberately gets no secrets:** every store credential is
read inside a request handler, so a build that needs one has leaked a database
call into module scope. Failing there is the point.

`.github/workflows/deploy.yml` deploys only after CI succeeds, so a red build is
never shipped — the one real advantage over Vercel's own Git integration, which
deploys on push regardless of test results.

Full setup, including the MongoDB Atlas `0.0.0.0/0` network rule that Vercel's
lack of stable outbound IPs requires: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## Documentation

| | |
|---|---|
| [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) | Pitch, personas, example roadmap |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Data model, scoring math, adaptation logic, resource sourcing |
| [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md) | Day-by-day plan, demo script, judging alignment |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Pipeline, environment, serverless notes |
| [`CLAUDE.md`](CLAUDE.md) | Working agreement, non-negotiable product rules, and an honest running status log |

---

## Team areas

This branch is one implementation within a wider team project. The five areas
the team divided the work into:

1. **Learner profiling / conversational interface** — capture goals, build profiles
2. **Recommendation engine** — suggest relevant courses and resources
3. **Learning path & prerequisite logic** — generate ordered sequences
4. **Explainability + dashboard** — visualise paths and explain recommendations
5. **Integration + adaptive feedback loop** — connect components, adapt on feedback

---

## Known limitations

Kept here deliberately rather than left for someone to discover.

- **The question bank lives in code** (`lib/diagnostic/questions*.ts`), not in
  Mongo. Fine while domains ship with the app; a real limitation the moment
  domains are authored without a deploy.
- **The dashboard and diagnostic card layouts** are on the shared dark palette
  and shared components, but their internal composition has not had a bespoke
  design pass — they are consistent rather than crafted.
- **Deleting a catalog row leaves existing evidence pointing at it.** That is
  intentional — evidence a learner earned should not vanish because a curator
  tidied the catalog — but the evidence card then shows the resource id rather
  than its title.
- **Live discovery (layer 2) is not built.** The curated catalog is the only
  content source, which is what keeps the demo deterministic and offline-safe.
- **The SSRF filter on the admin URL check tests literal addresses only.** A
  hostname that *resolves* to a private address still gets through; closing that
  needs a DNS lookup plus a pinned-IP fetch, which is only worth it if that form
  stops being admin-only.
- **The login throttle is keyed by email**, so someone who knows an address can
  lock it for 15 minutes. Deliberate: per-IP only would hand a botnet unlimited
  guesses.
- **Nothing rate-limits the LLM routes per learner** beyond input size caps, so a
  signed-in learner can spend API budget in a loop.
- **The JD gap analyzer and verification interview need `GEMINI_API_KEY`** and
  have no deterministic fallback (unlike explanations). A Gemini outage is
  retried and then surfaces as a 502 — those two features
  are simply unavailable while the key is missing or the model is down.
- **`/verify/<id>` proves integrity, not provenance.** A valid signature means
  the record's fields are unchanged since mint; it does not attest that the
  learner did the work unaided — that assurance comes from the server-side
  grading, which the verify page does not re-run.

---

## License

[MIT](LICENSE).
