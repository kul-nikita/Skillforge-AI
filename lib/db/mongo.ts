import { Resolver } from "node:dns/promises";
import { MongoClient, type Db } from "mongodb";

const DB_NAME = process.env.MONGODB_DB ?? "skillforge";

/**
 * `mongodb+srv://` needs SRV + TXT lookups, and some environments hand Node a
 * loopback resolver that answers ECONNREFUSED without falling through to the
 * next server. Mutating the global resolver list races with framework init, so
 * we resolve the records explicitly and hand the driver a plain seed list.
 */
const DNS_SERVERS = (process.env.DNS_SERVERS ?? "8.8.8.8,1.1.1.1").split(",").map((s) => s.trim());

/** Each serverless instance keeps its own pool; too large exhausts an Atlas free tier. */
const MAX_POOL_SIZE = Number(process.env.MONGODB_MAX_POOL_SIZE ?? 10);

/**
 * Falls back to the driver's own SRV lookup: serverless sandboxes may block
 * outbound DNS to a public resolver, and there the platform resolver works fine.
 * The workaround must never be the only path.
 */
async function resolveSrvUri(uri: string): Promise<string> {
  if (!uri.startsWith("mongodb+srv://")) {
    return uri;
  }

  try {
    return await resolveSrvViaExplicitDns(uri);
  } catch (error) {
    console.warn(
      `[mongo] explicit SRV resolution failed (${
        error instanceof Error ? error.message : error
      }); falling back to the driver's own SRV lookup.`
    );
    return uri;
  }
}

async function resolveSrvViaExplicitDns(uri: string): Promise<string> {
  const url = new URL(uri);
  const srvHost = url.hostname;
  const resolver = new Resolver();
  resolver.setServers(DNS_SERVERS);

  const [records, txtChunks] = await Promise.all([
    resolver.resolveSrv(`_mongodb._tcp.${srvHost}`),
    resolver.resolveTxt(srvHost).catch(() => [] as string[][])
  ]);

  if (records.length === 0) {
    throw new Error(`No SRV records for ${srvHost}`);
  }

  const seedList = records.map((record) => `${record.name}:${record.port}`).join(",");
  const params = new URLSearchParams(url.search);
  // TXT carries connection options (authSource, replicaSet); explicit ones win.
  for (const [key, value] of new URLSearchParams(txtChunks.flat().join("&"))) {
    if (!params.has(key)) {
      params.set(key, value);
    }
  }
  params.set("tls", "true");
  params.set("authSource", params.get("authSource") ?? "admin");

  const credentials = url.username ? `${url.username}:${url.password}@` : "";
  return `mongodb://${credentials}${seedList}/${url.pathname.replace(/^\//, "")}?${params}`;
}

/** Cached on globalThis: HMR would otherwise open a new pool on every reload. */
const globalForMongo = globalThis as typeof globalThis & {
  __mongoConnecting?: Promise<MongoClient>;
  __mongoIndexes?: Promise<void>;
};

/**
 * Indexes the code depends on for correctness, not just speed: unique email
 * makes two concurrent signups a duplicate-key error rather than two accounts,
 * and the TTLs expire sessions and throttle rows without a cleanup job.
 * Idempotent, and runs once per process.
 */
export async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection("learning_resources").createIndex({ skillTags: 1 }),
    db.collection("learning_resources").createIndex({ id: 1 }, { unique: true }),
    db.collection("learner_profile").createIndex({ learnerId: 1 }, { unique: true }),
    db.collection("events").createIndex({ learnerId: 1, timestamp: 1 }),
    db.collection("evidence").createIndex({ learnerId: 1, createdAt: 1 }),
    db.collection("evidence").createIndex({ id: 1 }, { unique: true }),
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("users").createIndex({ id: 1 }, { unique: true }),
    db.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("login_attempts").createIndex({ key: 1 }, { unique: true }),
    db.collection("login_attempts").createIndex({ firstAttemptAt: 1 }, { expireAfterSeconds: 3600 })
  ]);
}

async function getMongoClient() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is required for MongoDB operations.");
  }

  // One in-flight connect shared across concurrent handlers and reloads.
  globalForMongo.__mongoConnecting ??= resolveSrvUri(uri).then((resolved) =>
    new MongoClient(resolved, { maxPoolSize: MAX_POOL_SIZE }).connect()
  );

  try {
    return await globalForMongo.__mongoConnecting;
  } catch (error) {
    globalForMongo.__mongoConnecting = undefined; // let the next request retry
    throw error;
  }
}

export async function getDb(): Promise<Db> {
  const db = (await getMongoClient()).db(DB_NAME);

  globalForMongo.__mongoIndexes ??= ensureIndexes(db).catch((error) => {
    // A restricted user can still serve traffic: worth a loud log, not a 500.
    globalForMongo.__mongoIndexes = undefined;
    console.error("[mongo] could not ensure indexes:", error instanceof Error ? error.message : error);
  });

  return db;
}

export async function closeMongoClient() {
  const pending = globalForMongo.__mongoConnecting;
  globalForMongo.__mongoConnecting = undefined;
  globalForMongo.__mongoIndexes = undefined;
  await pending?.then((c) => c.close()).catch(() => undefined);
}
