import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db/mongo";
import { deriveMasteryFromEvents, type LearningEvent } from "@/lib/adaptation/mastery";
import type { Evidence, LearnerProfile, MasteryMap } from "@/lib/types";
import { signEvidence } from "@/lib/crypto/signing";

async function collections() {
  const db = await getDb();
  return {
    profiles: db.collection<LearnerProfile>("learner_profile"),
    events: db.collection<LearningEvent & { id: string }>("events"),
    evidence: db.collection<Evidence>("evidence")
  };
}

export async function getProfile(learnerId: string): Promise<LearnerProfile | null> {
  const { profiles } = await collections();
  return profiles.findOne({ learnerId }, { projection: { _id: 0 } });
}

export async function upsertProfile(
  profile: Omit<LearnerProfile, "createdAt" | "updatedAt">
): Promise<LearnerProfile> {
  const { profiles } = await collections();
  const now = new Date().toISOString();

  await profiles.updateOne(
    { learnerId: profile.learnerId },
    { $set: { ...profile, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );

  return (await getProfile(profile.learnerId))!;
}

/**
 * Events are append-only — mastery is always derived from them, never written
 * directly. That's what makes a replan explainable after the fact.
 */
export async function appendEvents(events: LearningEvent[]): Promise<number> {
  if (events.length === 0) {
    return 0;
  }

  const { events: collection } = await collections();
  const result = await collection.insertMany(
    events.map((event) => ({ ...event, id: randomUUID() })),
    { ordered: false }
  );

  return result.insertedCount;
}

export async function listEvents(learnerId: string): Promise<LearningEvent[]> {
  const { events } = await collections();
  return events.find({ learnerId }, { projection: { _id: 0 } }).sort({ timestamp: 1 }).toArray();
}

/** Mastery is a projection of the event log, recomputed on read. */
export async function getMastery(learnerId: string): Promise<MasteryMap> {
  return deriveMasteryFromEvents(await listEvents(learnerId));
}

export async function listEvidence(learnerId: string): Promise<Evidence[]> {
  const { evidence } = await collections();
  return evidence.find({ learnerId }, { projection: { _id: 0 } }).sort({ createdAt: 1 }).toArray();
}

export async function getEvidenceById(evidenceId: string): Promise<Evidence | null> {
  const { evidence } = await collections();
  return evidence.findOne({ id: evidenceId }, { projection: { _id: 0 } });
}

export async function addEvidence(record: Omit<Evidence, "id" | "signature">): Promise<Evidence> {
  const { evidence } = await collections();
  const id = randomUUID();
  const signature = signEvidence({ ...record, id });
  const withIdAndSignature: Evidence = { ...record, id, signature };
  // Spread on the way in: the driver stamps `_id` onto the object it is given,
  // and this one is returned straight to the client.
  await evidence.insertOne({ ...withIdAndSignature });
  return withIdAndSignature;
}

/** Product rule 5: learners can export and delete everything we hold. */
export async function exportLearnerData(learnerId: string) {
  return {
    profile: await getProfile(learnerId),
    events: await listEvents(learnerId),
    mastery: await getMastery(learnerId),
    evidence: await listEvidence(learnerId)
  };
}

export async function deleteLearnerData(learnerId: string) {
  const { profiles, events, evidence } = await collections();
  const [profileResult, eventResult, evidenceResult] = await Promise.all([
    profiles.deleteMany({ learnerId }),
    events.deleteMany({ learnerId }),
    evidence.deleteMany({ learnerId })
  ]);

  return {
    profiles: profileResult.deletedCount,
    events: eventResult.deletedCount,
    evidence: evidenceResult.deletedCount
  };
}
