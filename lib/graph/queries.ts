import { runQuery } from "@/lib/graph/neo4j";
import type { Domain, MasteryMap, Role, Skill, SkillGraph } from "@/lib/types";

/**
 * All sequencing structure is read from Neo4j at request time. The traversals
 * that matter run as variable-length Cypher patterns, not as recursion here.
 */

export async function listDomains(): Promise<Domain[]> {
  const rows = await runQuery<{ id: string; name: string; description: string }>(
    `MATCH (d:Domain)
     RETURN d.id AS id, d.name AS name, d.description AS description
     ORDER BY d.name`
  );

  return rows;
}

export async function listRoles(domainId?: string): Promise<Role[]> {
  const rows = await runQuery<{
    id: string;
    domainId: string;
    title: string;
    description: string;
    requiredSkills: Array<{ skillId: string; importance: number }>;
  }>(
    `MATCH (r:Role)-[:IN_DOMAIN]->(d:Domain)
     WHERE $domainId IS NULL OR d.id = $domainId
     OPTIONAL MATCH (r)-[req:REQUIRES]->(s:Skill)
     WITH r, d, collect({ skillId: s.id, importance: req.importance }) AS requiredSkills
     RETURN r.id AS id, d.id AS domainId, r.title AS title, r.description AS description,
            [x IN requiredSkills WHERE x.skillId IS NOT NULL] AS requiredSkills
     ORDER BY r.title`,
    { domainId: domainId ?? null }
  );

  return rows;
}

export async function getRole(roleId: string): Promise<Role | null> {
  const [role] = await listRolesByIds([roleId]);
  return role ?? null;
}

async function listRolesByIds(roleIds: string[]): Promise<Role[]> {
  return runQuery<Role>(
    `MATCH (r:Role)-[:IN_DOMAIN]->(d:Domain)
     WHERE r.id IN $roleIds
     OPTIONAL MATCH (r)-[req:REQUIRES]->(s:Skill)
     WITH r, d, collect({ skillId: s.id, importance: req.importance }) AS requiredSkills
     RETURN r.id AS id, d.id AS domainId, r.title AS title, r.description AS description,
            [x IN requiredSkills WHERE x.skillId IS NOT NULL] AS requiredSkills`,
    { roleIds }
  );
}

/** Skills for one domain, each with its direct prerequisites. */
export async function getSkillGraph(domainId?: string): Promise<SkillGraph> {
  const skills = await runQuery<Skill>(
    `MATCH (s:Skill)-[:IN_DOMAIN]->(d:Domain)
     WHERE $domainId IS NULL OR d.id = $domainId
     OPTIONAL MATCH (prereq:Skill)-[:PREREQUISITE_OF]->(s)
     WITH s, d, collect(prereq.id) AS prerequisites
     RETURN s.id AS id, d.id AS domainId, s.name AS name, s.category AS category,
            s.description AS description, prerequisites
     ORDER BY s.name`,
    { domainId: domainId ?? null }
  );

  return { skills };
}

export async function getSkillsByIds(skillIds: string[]): Promise<Skill[]> {
  if (skillIds.length === 0) {
    return [];
  }

  return runQuery<Skill>(
    `MATCH (s:Skill)-[:IN_DOMAIN]->(d:Domain)
     WHERE s.id IN $skillIds
     OPTIONAL MATCH (prereq:Skill)-[:PREREQUISITE_OF]->(s)
     WITH s, d, collect(prereq.id) AS prerequisites
     RETURN s.id AS id, d.id AS domainId, s.name AS name, s.category AS category,
            s.description AS description, prerequisites`,
    { skillIds }
  );
}

/** Transitive dependents, in one traversal. */
export async function findDownstreamSkills(skillId: string): Promise<string[]> {
  const rows = await runQuery<{ downstream: string[] }>(
    `MATCH (s:Skill {id: $skillId})
     OPTIONAL MATCH (s)-[:PREREQUISITE_OF*1..]->(dependent:Skill)
     RETURN [x IN collect(DISTINCT dependent.id) WHERE x IS NOT NULL] AS downstream`,
    { skillId }
  );

  return rows[0]?.downstream ?? [];
}

export type ResourceGateResult = {
  resourceId: string;
  unmetPrerequisites: string[];
  teaches: string[];
};

/**
 * The gate for candidates that arrived from anywhere but a tag match (Qdrant).
 * Returns what each resource is still missing, so the UI can say why something
 * is blocked instead of silently dropping it.
 */
export async function gateResources(
  resourceIds: string[],
  mastery: MasteryMap,
  threshold = 0.6
): Promise<ResourceGateResult[]> {
  if (resourceIds.length === 0) {
    return [];
  }

  return runQuery<ResourceGateResult>(
    // Gated on the resource's own REQUIRES_SKILL edges *and* the full
    // prerequisite chain of whatever it TEACHES. Without the second half, a row
    // declaring no prerequisites bypasses the graph entirely — the catalog could
    // unlock a skill. Skills the resource teaches are excluded so it cannot
    // block itself.
    //
    // `toString(p)` is load-bearing: Cypher infers a list comprehension's
    // element type from its WHERE predicate, so the list is typed LIST<BOOLEAN>
    // and rejected as a map key even though it holds strings at runtime.
    `MATCH (res:Resource) WHERE res.id IN $resourceIds
     OPTIONAL MATCH (res)-[:TEACHES]->(taught:Skill)
     WITH res, collect(DISTINCT taught.id) AS teaches
     OPTIONAL MATCH (res)-[:REQUIRES_SKILL]->(direct:Skill)
     WITH res, teaches, collect(DISTINCT direct.id) AS directIds
     OPTIONAL MATCH (res)-[:TEACHES]->(:Skill)<-[:PREREQUISITE_OF*1..]-(chain:Skill)
     WITH res, teaches, directIds, collect(DISTINCT chain.id) AS chainIds
     WITH res, teaches,
          [d IN directIds WHERE NOT d IN chainIds AND NOT d IN teaches] +
          [c IN chainIds WHERE NOT c IN teaches] AS prereqIds
     RETURN res.id AS resourceId, teaches,
            [p IN prereqIds WHERE coalesce($mastery[toString(p)], 0.0) < $threshold]
              AS unmetPrerequisites`,
    { resourceIds, mastery, threshold }
  );
}

/** The gate every candidate passes before scoring: teaches the skill, prerequisites met. */
export async function findPrerequisiteValidResourceIds(
  skillId: string,
  mastery: MasteryMap,
  threshold = 0.6
): Promise<string[]> {
  const rows = await runQuery<{ resourceIds: string[] }>(
    // Same rule as `gateResources` — see the note on `toString(p)` there.
    `MATCH (res:Resource)-[:TEACHES]->(target:Skill {id: $skillId})
     OPTIONAL MATCH (res)-[:TEACHES]->(taught:Skill)
     WITH res, target, collect(DISTINCT taught.id) AS teaches
     OPTIONAL MATCH (res)-[:REQUIRES_SKILL]->(direct:Skill)
     WITH res, target, teaches, collect(DISTINCT direct.id) AS directIds
     OPTIONAL MATCH (chain:Skill)-[:PREREQUISITE_OF*1..]->(target)
     WITH res, teaches, directIds, collect(DISTINCT chain.id) AS chainIds
     WITH res, teaches,
          [d IN directIds WHERE NOT d IN chainIds AND NOT d IN teaches] +
          [c IN chainIds WHERE NOT c IN teaches] AS prereqIds
     WHERE all(p IN prereqIds WHERE coalesce($mastery[toString(p)], 0.0) >= $threshold)
     RETURN collect(res.id) AS resourceIds`,
    { skillId, mastery, threshold }
  );

  return rows[0]?.resourceIds ?? [];
}
