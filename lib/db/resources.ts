import { getDb } from "@/lib/db/mongo";
import type { LearningResource } from "@/lib/types";

const COLLECTION = "learning_resources";

async function collection() {
  return (await getDb()).collection<LearningResource & { _id: string }>(COLLECTION);
}

export async function findResourcesByIds(ids: string[]): Promise<LearningResource[]> {
  if (ids.length === 0) {
    return [];
  }

  const rows = await (await collection()).find({ id: { $in: ids } }).toArray();
  return rows.map(stripMongoId);
}

export async function findResourcesBySkill(skillId: string): Promise<LearningResource[]> {
  const rows = await (await collection()).find({ skillTags: skillId }).toArray();
  return rows.map(stripMongoId);
}

function stripMongoId(row: LearningResource & { _id?: string }): LearningResource {
  const { _id: _ignored, ...resource } = row;
  return resource;
}

export async function listResources(limit = 500): Promise<LearningResource[]> {
  const rows = await (await collection()).find({}, { projection: { _id: 0 } }).limit(limit).toArray();
  return rows.map(stripMongoId);
}

/** Duplicate URLs are a recurring catalog defect, so the check is a query. */
export async function findResourceByUrl(url: string): Promise<LearningResource | null> {
  const row = await (await collection()).findOne({ url }, { projection: { _id: 0 } });
  return row ? stripMongoId(row) : null;
}

export async function upsertResource(resource: LearningResource): Promise<void> {
  await (await collection()).updateOne(
    { id: resource.id },
    { $set: resource },
    { upsert: true }
  );
}

export async function deleteResource(resourceId: string): Promise<boolean> {
  const result = await (await collection()).deleteOne({ id: resourceId });
  return result.deletedCount > 0;
}
