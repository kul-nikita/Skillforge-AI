import { createHash } from "node:crypto";

/**
 * Qdrant point ids must be numeric or a UUID, but resources are slugs. Deriving
 * the UUID from the slug keeps the mapping stable: re-indexing overwrites the
 * right point instead of adding a duplicate, and deleting removes the right
 * vector. An array index would reshuffle every id when catalog order changed.
 */
export function pointIdForResource(resourceId: string): string {
  const hex = createHash("md5").update(resourceId).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join("-");
}
