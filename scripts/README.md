# Scripts

- `verify-gate.ts` — asserts the prerequisite gate against the live Neo4j
  database. The gate is a Cypher traversal, so vitest cannot reach it; this is
  the test that covers it.

```bash
npm run graph:verify    # needs .env with NEO4J_* set, and a seeded graph
```

Seeding lives in [`seed/`](../seed) and is driven by `npm run db:seed:all`.
