import { describe, expect, it } from "vitest";
import {
  checkUrl,
  isAllowedHost,
  isSafeFetchTarget,
  normalizeHost,
  structuralIssues
} from "@/lib/services/catalog-validation";
import { allResources } from "@/seed/data";
import type { LearningResource } from "@/lib/types";

const base: LearningResource = {
  id: "test-row",
  title: "A Test Row",
  provider: "Example",
  url: "https://owasp.org/example",
  resourceType: "course",
  skillTags: ["linux-fundamentals"],
  difficulty: "beginner",
  durationMinutes: 60,
  costType: "free",
  language: "en",
  qualityScore: 0.8,
  isCurated: true,
  prerequisites: [],
  evidenceType: null,
  lastVerifiedAt: "2026-08-27",
  description: "A row used only by tests."
};

const known = ["linux-fundamentals", "networking-basics"];

describe("sourcing allowlist", () => {
  it("accepts every host already curated in the catalog", () => {
    for (const resource of allResources) {
      expect(isAllowedHost(resource.url), resource.url).toBe(true);
    }
  });

  it("rejects an arbitrary host", () => {
    expect(isAllowedHost("https://random-course-mill.example.com/x")).toBe(false);
  });

  it("treats www as the same host", () => {
    expect(normalizeHost("https://www.owasp.org/a")).toBe("owasp.org");
  });

  it("rejects a malformed url rather than throwing", () => {
    expect(isAllowedHost("not-a-url")).toBe(false);
  });
});

describe("structural rules", () => {
  it("accepts a well-formed row", () => {
    expect(structuralIssues(base, known)).toEqual([]);
  });

  // This exact defect shipped twice: the NIST row and kubernetes-basics-tutorial.
  it("rejects a row that requires what it teaches", () => {
    const issues = structuralIssues(
      { ...base, prerequisites: ["linux-fundamentals"] },
      known
    );
    expect(issues.some((issue) => issue.message.includes("both taught and required"))).toBe(true);
  });

  it("rejects a tag naming a skill that does not exist in the graph", () => {
    const issues = structuralIssues({ ...base, skillTags: ["not-a-skill"] }, known);
    expect(issues.some((issue) => issue.field === "skillTags")).toBe(true);
  });

  it("rejects a row that teaches nothing", () => {
    expect(structuralIssues({ ...base, skillTags: [] }, known).length).toBeGreaterThan(0);
  });

  it("rejects nonsense duration and quality", () => {
    expect(structuralIssues({ ...base, durationMinutes: 0 }, known).length).toBe(1);
    expect(structuralIssues({ ...base, qualityScore: 1.5 }, known).length).toBe(1);
  });
});

/**
 * The admin form makes the *server* fetch a URL someone typed, and
 * `allowNewDomain` deliberately waives the host allowlist — so this is the only
 * thing keeping it from being an SSRF probe of the deployment's own network.
 */
describe("isSafeFetchTarget", () => {
  it("allows ordinary public http(s) URLs", () => {
    expect(isSafeFetchTarget("https://learn.microsoft.com/en-us/training/")).toBe(true);
    expect(isSafeFetchTarget("http://example.com/path?q=1")).toBe(true);
    expect(isSafeFetchTarget("https://8.8.8.8/")).toBe(true);
  });

  it("blocks non-http schemes", () => {
    expect(isSafeFetchTarget("file:///etc/passwd")).toBe(false);
    expect(isSafeFetchTarget("ftp://example.com/x")).toBe(false);
    expect(isSafeFetchTarget("not a url")).toBe(false);
  });

  it("blocks loopback and internal names", () => {
    expect(isSafeFetchTarget("http://localhost:3000/")).toBe(false);
    expect(isSafeFetchTarget("http://db.internal/")).toBe(false);
    expect(isSafeFetchTarget("http://printer.local/")).toBe(false);
    expect(isSafeFetchTarget("http://[::1]/")).toBe(false);
  });

  it("blocks private and link-local address ranges", () => {
    for (const host of ["127.0.0.1", "10.0.0.5", "172.16.4.4", "192.168.1.1", "100.64.0.1", "0.0.0.0"]) {
      expect(isSafeFetchTarget(`http://${host}/`)).toBe(false);
    }
  });

  it("blocks the cloud metadata endpoint", () => {
    expect(isSafeFetchTarget("http://169.254.169.254/latest/meta-data/")).toBe(false);
  });

  it("checkUrl refuses without making the request", async () => {
    const result = await checkUrl("http://169.254.169.254/latest/meta-data/");

    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.detail).toMatch(/local or private/);
  });
});
