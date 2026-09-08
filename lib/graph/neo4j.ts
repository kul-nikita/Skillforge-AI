import neo4j, { type Driver } from "neo4j-driver";

/**
 * Cached on globalThis, not module scope: Next.js dev re-imports modules on
 * every HMR pass, and a per-module driver leaks a new connection pool each
 * time until AuraDB refuses new connections ("connection acquisition timed
 * out"). One driver per process is also correct in production.
 */
const globalForNeo4j = globalThis as typeof globalThis & { __neo4jDriver?: Driver };

function getNeo4jDriver() {
  const uri = process.env.NEO4J_URI;
  const user = process.env.NEO4J_USER;
  const password = process.env.NEO4J_PASSWORD;

  if (!uri || !user || !password) {
    throw new Error("NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD are required.");
  }

  globalForNeo4j.__neo4jDriver ??= neo4j.driver(uri, neo4j.auth.basic(user, password), {
    maxConnectionPoolSize: 20,
    connectionAcquisitionTimeout: 15_000
  });

  return globalForNeo4j.__neo4jDriver;
}

export async function runQuery<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const session = getNeo4jDriver().session();

  try {
    const result = await session.run(cypher, params);
    return result.records.map((record) => record.toObject() as T);
  } finally {
    await session.close();
  }
}

export async function closeNeo4jDriver() {
  await globalForNeo4j.__neo4jDriver?.close();
  globalForNeo4j.__neo4jDriver = undefined;
}
