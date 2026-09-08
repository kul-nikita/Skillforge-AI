import { describe, expect, it } from "vitest";
import { demoEvidence } from "@/lib/data/demo-learner";
import { evidenceSchema, learningResourceSchema } from "@/lib/db/schemas";
import { allResources, allRoles, allSkills, domains } from "@/seed/data";

// Guards every seeded domain, not just the first one — a new domain bundle is
// held to the same bar without touching this file.
const learningResources = allResources;
const roles = allRoles;
const skillIds = new Set(allSkills.map((skill) => skill.id));

describe("catalog integrity", () => {
  it("keeps skill ids unique across domains, so the graph cannot merge two domains' skills", () => {
    const ids = allSkills.map((skill) => skill.id);
    expect(new Set(ids).size, "duplicate skill id across domains").toBe(ids.length);
  });

  it("keeps role ids unique across domains", () => {
    const ids = allRoles.map((role) => role.id);
    expect(new Set(ids).size, "duplicate role id across domains").toBe(ids.length);
  });

  it("only lets a skill require prerequisites from its own domain", () => {
    const domainOfSkill = new Map(allSkills.map((skill) => [skill.id, skill.domainId]));

    for (const skill of allSkills) {
      for (const prerequisiteId of skill.prerequisites) {
        expect(
          domainOfSkill.get(prerequisiteId),
          `${skill.id} requires ${prerequisiteId} from another domain`
        ).toBe(skill.domainId);
      }
    }
  });

  it("has no prerequisite cycle, which would make a skill permanently unreachable", () => {
    const prerequisitesOf = new Map(allSkills.map((skill) => [skill.id, skill.prerequisites]));
    const state = new Map<string, "visiting" | "done">();

    const walk = (id: string, trail: string[]): void => {
      if (state.get(id) === "done") return;
      expect(state.get(id), `prerequisite cycle: ${[...trail, id].join(" -> ")}`).not.toBe("visiting");
      state.set(id, "visiting");
      for (const next of prerequisitesOf.get(id) ?? []) walk(next, [...trail, id]);
      state.set(id, "done");
    };

    for (const skill of allSkills) walk(skill.id, []);
  });

  it("keeps every role's required skills prerequisite-closed", () => {
    // If a required skill depends on something the role does not require, the
    // roadmap tells the learner to "build X first" while never offering X as a
    // gap to work on — a dead end. Nine of nineteen roles had this before it
    // was checked here, including two that predate the multi-domain work.
    const prerequisitesOf = new Map(allSkills.map((skill) => [skill.id, skill.prerequisites]));

    const chain = (id: string, seen = new Set<string>()) => {
      for (const prerequisite of prerequisitesOf.get(id) ?? []) {
        if (!seen.has(prerequisite)) {
          seen.add(prerequisite);
          chain(prerequisite, seen);
        }
      }
      return seen;
    };

    for (const role of allRoles) {
      const required = new Set(role.requiredSkills.map((item) => item.skillId));
      for (const { skillId } of role.requiredSkills) {
        for (const prerequisite of chain(skillId)) {
          expect(
            required,
            `${role.id} requires ${skillId}, which needs ${prerequisite} — but the role never asks for it`
          ).toContain(prerequisite);
        }
      }
    }
  });

  it("gives every domain at least one role", () => {
    for (const bundle of domains) {
      expect(bundle.roles.length, `${bundle.domain.id} has no roles`).toBeGreaterThan(0);
    }
  });

  it("has at least the 30 rows the demo catalog calls for", () => {
    expect(learningResources.length).toBeGreaterThanOrEqual(30);
  });

  it("matches the persisted resource schema", () => {
    for (const resource of learningResources) {
      expect(() => learningResourceSchema.parse(resource)).not.toThrow();
    }
  });

  it("uses unique resource ids", () => {
    const ids = learningResources.map((resource) => resource.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not list the same URL twice", () => {
    const urls = learningResources.map((resource) => resource.url);
    expect(new Set(urls).size, "duplicate URL in catalog").toBe(urls.length);
  });

  it("only references skills that exist in the graph", () => {
    for (const resource of learningResources) {
      for (const skillId of [...resource.skillTags, ...resource.prerequisites]) {
        expect(skillIds, `${resource.id} references unknown skill ${skillId}`).toContain(skillId);
      }
    }
  });

  it("never lists a resource's own taught skill as its prerequisite", () => {
    for (const resource of learningResources) {
      for (const skillId of resource.prerequisites) {
        expect(resource.skillTags, `${resource.id} requires what it teaches`).not.toContain(skillId);
      }
    }
  });

  it("covers every required skill of every role with an evidence-producing resource", () => {
    for (const role of roles) {
      for (const { skillId } of role.requiredSkills) {
        const covering = learningResources.filter(
          (resource) => resource.skillTags.includes(skillId) && resource.evidenceType
        );
        expect(covering.length, `${role.id} skill ${skillId} has no evidence resource`).toBeGreaterThan(0);
      }
    }
  });

  it("only issues evidence against skills and resources that exist", () => {
    const resourceById = new Map(learningResources.map((resource) => [resource.id, resource]));

    for (const evidence of demoEvidence) {
      expect(() => evidenceSchema.parse(evidence)).not.toThrow();
      expect(skillIds, `${evidence.id} references unknown skill`).toContain(evidence.skillId);

      const resource = resourceById.get(evidence.resourceId);
      expect(resource, `${evidence.id} references unknown resource ${evidence.resourceId}`).toBeDefined();
      // The wallet claims this artifact came from that resource, so the
      // resource must actually produce that artifact type for this skill.
      expect(resource!.evidenceType).toBe(evidence.evidenceType);
      expect(resource!.skillTags).toContain(evidence.skillId);
    }
  });

  it("gives every role's skills more than one candidate so scoring can actually rank", () => {
    for (const role of roles) {
      for (const { skillId } of role.requiredSkills) {
        const candidates = learningResources.filter((resource) => resource.skillTags.includes(skillId));
        expect(
          candidates.length,
          `${role.id} skill ${skillId} has only ${candidates.length} candidate(s)`
        ).toBeGreaterThan(1);
      }
    }
  });
});
