# Deployment

The app is a single Next.js deployable. Every store credential is read inside a
request handler, so **the build needs no secrets**.

## Pipeline

Deployment is Vercel's Git integration: connect the repository once in the
Vercel dashboard and every push to the default branch ships to production, with
other branches getting preview URLs. There are no GitHub Actions workflows in
this repo.

**This has to be connected for anything to deploy.** If pushes are landing on
`main` and the live site does not change, the repository is not linked — check
Vercel → Project → Settings → Git.

The trade-off of driving deploys this way is that Vercel ships whatever you push
without waiting for tests. Run the checks before you push:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

## One-time setup

These steps need account access and credentials, so they have to be done by a
human — do not paste keys into a chat or a pull request.

### 1. Create the Vercel project

```bash
npm i -g vercel
vercel login
vercel link          # from the repo root; creates .vercel/project.json
```

### 2. Set environment variables

In **Vercel → Project → Settings → Environment Variables**, add each of the
following for Production *and* Preview. The names match `.env.example`:

| Variable | Notes |
|---|---|
| `CEREBRAS_API_KEY` | Every chat-model call (`gemma-4-31b`): intent extraction, explanations, JD parsing, mentor/coach, interview. Without it the app still works — explanations fall back to deterministic text. |
| `GEMINI_API_KEY` | Embeddings only — Cerebras serves no embedding model, so semantic search still calls `gemini-embedding-001`. |
| `MONGODB_URI` | Full `mongodb+srv://` connection string. |
| `NEO4J_URI` | `neo4j+s://…` |
| `NEO4J_USER` | usually `neo4j` |
| `NEO4J_PASSWORD` | |
| `QDRANT_URL` | |
| `QDRANT_API_KEY` | |
| `EVIDENCE_SIGNING_SECRET` | HMAC key for evidence signatures, checked by `/verify/<id>`. Optional — a well-known dev key is used when unset, so set a real random value if shared evidence links need to be unforgeable. |
| `ADMIN_EMAILS` | Comma-separated emails allowed into `/admin`. Unset means the catalog is read-only for everyone. |

Optional tuning:

| Variable | Default | Why you might change it |
|---|---|---|
| `MONGODB_MAX_POOL_SIZE` | `10` | Each serverless instance keeps its own pool; lower it if Atlas reports connection pressure. |
| `MONGODB_DB` | `skillforge` | Point at a different database. |
| `DNS_SERVERS` | `8.8.8.8,1.1.1.1` | Only used by the local SRV workaround; ignored when it falls back. |

### 3. Allow Vercel to reach MongoDB Atlas

Serverless functions do not have stable outbound IPs, so **Atlas → Network
Access** must allow `0.0.0.0/0`, or you must enable a static-egress option.
Without this, every request that touches Mongo will time out in production
while working perfectly on your laptop.

Neo4j AuraDB and Qdrant Cloud accept connections from anywhere by default and
need no equivalent change.

### 4. Seed the stores

The seed scripts write to whatever the credentials point at, so run them once
against the same instances the deployment uses:

```bash
npm run db:seed:all     # graph → mongo → vector, in that order
npm run graph:verify    # asserts the prerequisite gate against the live graph
```

### 5. Connect the repository to Vercel

**Vercel → Project → Settings → Git → Connect Git Repository.** Pick this repo
and set the production branch to `main`. From then on a push deploys itself;
nothing else is required.

## Notes on running serverless

- **`middleware.ts` runs on the Edge runtime** and does a cookie-presence
  redirect only. It cannot reach Mongo; the real session check is
  `requireUserOrRedirect()` in pages and `requireUser()` in API routes, so a
  forged cookie is rejected there rather than at the edge.
- **Driver instances are cached on `globalThis`** so a warm function reuses its
  connection pool instead of opening a new one per invocation.
- **`mongodb+srv` resolution falls back.** The explicit-DNS path exists for a
  local resolver quirk; if it fails (a sandbox may block outbound DNS to a
  public resolver) the original SRV URI is handed to the driver instead. A
  warning is logged, and the connection still succeeds.
- **Every page is `force-dynamic`**, so nothing tries to reach a database at
  build time.
