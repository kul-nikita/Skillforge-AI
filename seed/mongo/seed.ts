import { closeMongoClient, ensureIndexes, getDb } from "@/lib/db/mongo";
import { learningResourceSchema } from "@/lib/db/schemas";
import { allResources } from "@/seed/data";
import { demoEvidence } from "@/lib/data/demo-learner";
import { DEMO_LEARNER_ID } from "@/lib/constants";
import { signEvidence } from "@/lib/crypto/signing";
import type { LearningResource } from "@/lib/types";

async function main() {
  const parsed = allResources.map((resource) => learningResourceSchema.parse(resource));
  const db = await getDb();
  const collection = db.collection<LearningResource & { _id: string }>("learning_resources");

  await collection.deleteMany({});
  await collection.insertMany(parsed.map((resource) => ({ ...resource, _id: resource.id })));
  // Index definitions live with the app, not here — the app needs them whether
  // or not this script was ever run.
  await ensureIndexes(db);

  // Sample wallet for the demo learner, so the evidence page has real rows to read.
  const evidence = db.collection("evidence");
  await evidence.deleteMany({ learnerId: DEMO_LEARNER_ID });
  // Signed with the real key: the signature attests the record has not been
  // altered, which is all /verify ever claims. A placeholder string made the
  // public verify page report every demo row as tampered.
  await evidence.insertMany(
    demoEvidence.map((row) => {
      const record = { ...row, learnerId: DEMO_LEARNER_ID };
      return { ...record, signature: signEvidence(record) };
    })
  );

  console.log(`Seeded ${parsed.length} learning resources into MongoDB (db: ${db.databaseName}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeMongoClient);
