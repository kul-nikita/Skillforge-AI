import { closeNeo4jDriver, runQuery } from "@/lib/graph/neo4j";
import { allResources, domains } from "@/seed/data";

/**
 * Rebuilds the whole graph. Structure only — no learner state lives in Neo4j.
 */
async function main() {
  await runQuery("MATCH (n) DETACH DELETE n");
  await runQuery("CREATE CONSTRAINT skill_id IF NOT EXISTS FOR (s:Skill) REQUIRE s.id IS UNIQUE");
  await runQuery("CREATE CONSTRAINT role_id IF NOT EXISTS FOR (r:Role) REQUIRE r.id IS UNIQUE");
  await runQuery("CREATE CONSTRAINT domain_id IF NOT EXISTS FOR (d:Domain) REQUIRE d.id IS UNIQUE");
  await runQuery("CREATE CONSTRAINT resource_id IF NOT EXISTS FOR (r:Resource) REQUIRE r.id IS UNIQUE");

  let skillCount = 0;
  let roleCount = 0;
  let resourceCount = 0;

  for (const bundle of domains) {
    await runQuery(
      "MERGE (d:Domain {id: $id}) SET d.name = $name, d.description = $description",
      bundle.domain
    );

    for (const skill of bundle.skills) {
      await runQuery(
        `MERGE (s:Skill {id: $id})
         SET s.name = $name, s.category = $category, s.description = $description
         WITH s MATCH (d:Domain {id: $domainId}) MERGE (s)-[:IN_DOMAIN]->(d)`,
        skill
      );
      skillCount += 1;
    }

    // Prerequisite edges after all skills exist, so ordering in the data doesn't matter.
    for (const skill of bundle.skills) {
      for (const prereqId of skill.prerequisites) {
        await runQuery(
          `MATCH (prereq:Skill {id: $prereqId}), (skill:Skill {id: $skillId})
           MERGE (prereq)-[:PREREQUISITE_OF]->(skill)`,
          { prereqId, skillId: skill.id }
        );
      }
    }

    for (const role of bundle.roles) {
      await runQuery(
        `MERGE (r:Role {id: $id})
         SET r.title = $title, r.description = $description
         WITH r MATCH (d:Domain {id: $domainId}) MERGE (r)-[:IN_DOMAIN]->(d)`,
        role
      );

      for (const required of role.requiredSkills) {
        await runQuery(
          `MATCH (r:Role {id: $roleId}), (s:Skill {id: $skillId})
           MERGE (r)-[req:REQUIRES]->(s) SET req.importance = $importance`,
          { roleId: role.id, skillId: required.skillId, importance: required.importance }
        );
      }
      roleCount += 1;
    }

  }

  /**
   * Every resource, not just the ones hanging off a domain bundle. Projects are
   * cross-domain and live in their own file, and iterating the bundles here
   * silently left them out of Neo4j while Mongo had them — a row in one store
   * and not the other means the gate can never return it.
   */
  for (const resource of allResources) {
    await runQuery("MERGE (res:Resource {id: $id})", { id: resource.id });

    for (const skillId of resource.skillTags) {
      await runQuery(
        `MATCH (res:Resource {id: $resourceId}), (s:Skill {id: $skillId})
         MERGE (res)-[:TEACHES]->(s)`,
        { resourceId: resource.id, skillId }
      );
    }

    // A resource's own prerequisites are graph edges too, so the candidate
    // gate can be evaluated entirely in Cypher.
    for (const skillId of resource.prerequisites) {
      await runQuery(
        `MATCH (res:Resource {id: $resourceId}), (s:Skill {id: $skillId})
         MERGE (res)-[:REQUIRES_SKILL]->(s)`,
        { resourceId: resource.id, skillId }
      );
    }
    resourceCount += 1;
  }

  console.log(
    `Seeded ${domains.length} domains, ${skillCount} skills, ${roleCount} roles, ${resourceCount} resources into Neo4j.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeNeo4jDriver);
