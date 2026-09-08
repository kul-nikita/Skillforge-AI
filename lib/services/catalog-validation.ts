import { allResources } from "@/seed/data";
import type { LearningResource } from "@/lib/types";

/**
 * Product rule 7: sourcing stays inside an allowlist. The allowlist is the
 * hosts already in the curated catalog plus these, named in
 * docs/ARCHITECTURE.md#resource-sourcing.
 */
const ARCHITECTURE_SOURCES = [
  "portswigger.net",
  "learn.microsoft.com",
  "tryhackme.com",
  "academy.hackthebox.com",
  "owasp.org",
  "freecodecamp.org",
  "docs.aws.amazon.com",
  "skillbuilder.aws",
  "netacad.com",
  "github.com",
  "youtube.com"
];

export function normalizeHost(url: string): string {
  return new URL(url).host.replace(/^www\./, "").toLowerCase();
}

let cached: Set<string> | null = null;

function allowedHosts(): Set<string> {
  cached ??= new Set([
    ...allResources.map((resource) => normalizeHost(resource.url)),
    ...ARCHITECTURE_SOURCES
  ]);
  return cached;
}

export function isAllowedHost(url: string): boolean {
  try {
    return allowedHosts().has(normalizeHost(url));
  } catch {
    return false;
  }
}

export type ValidationIssue = { field: string; message: string };

/** Catalog rules the admin form must not be able to reintroduce. */
export function structuralIssues(
  resource: LearningResource,
  knownSkillIds: string[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const known = new Set(knownSkillIds);

  if (resource.skillTags.length === 0) {
    issues.push({ field: "skillTags", message: "A resource must teach at least one skill." });
  }

  for (const skillId of resource.skillTags) {
    if (!known.has(skillId)) {
      issues.push({ field: "skillTags", message: `No such skill in the graph: ${skillId}` });
    }
  }

  for (const skillId of resource.prerequisites) {
    if (!known.has(skillId)) {
      issues.push({ field: "prerequisites", message: `No such skill in the graph: ${skillId}` });
    }
  }

  // A row requiring what it teaches can never be recommended for that gap: the
  // gate filters it out precisely when the learner needs it.
  for (const skillId of resource.prerequisites) {
    if (resource.skillTags.includes(skillId)) {
      issues.push({
        field: "prerequisites",
        message: `"${skillId}" is listed as both taught and required, so this resource could never be recommended for it.`
      });
    }
  }

  if (resource.durationMinutes <= 0) {
    issues.push({ field: "durationMinutes", message: "Duration must be greater than zero." });
  }

  if (resource.qualityScore < 0 || resource.qualityScore > 1) {
    issues.push({ field: "qualityScore", message: "Quality score is a 0–1 value." });
  }

  return issues;
}

export type UrlCheck = { ok: boolean; status: number | null; detail: string };

const PRIVATE_HOSTNAMES = /^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i;

/**
 * `checkUrl` makes the server fetch a URL someone typed, and `allowNewDomain`
 * waives the host allowlist — so without this it is an SSRF primitive aimed at
 * the deployment's own network (cloud metadata on 169.254.169.254).
 *
 * Literal addresses only: a hostname that *resolves* to a private address still
 * gets through. Closing that needs a DNS lookup plus a pinned-IP fetch, which is
 * only worth it if this stops being admin-only.
 */
export function isSafeFetchTarget(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (PRIVATE_HOSTNAMES.test(hostname)) {
    return false;
  }

  // IPv6 loopback / link-local / unique-local.
  if (hostname === "::1" || /^(fe80|fc|fd)/.test(hostname)) {
    return false;
  }

  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) {
    return true;
  }

  const [a, b] = ipv4.slice(1).map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) || // link-local, incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/**
 * Every catalog row needs a URL that actually resolves, so the server fetches it
 * rather than trusting the form. `lastVerifiedAt` then records a check that
 * really happened.
 */
export async function checkUrl(url: string, timeoutMs = 10_000): Promise<UrlCheck> {
  const attempt = async (method: "HEAD" | "GET") => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        method,
        redirect: "follow",
        signal: controller.signal,
        // Some providers 403 anything that does not look like a browser.
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SkillForgeCatalogBot/1.0)" }
      });
    } finally {
      clearTimeout(timer);
    }
  };

  if (!isSafeFetchTarget(url)) {
    return {
      ok: false,
      status: null,
      detail: "Only public http(s) URLs can be verified — that host is local or private."
    };
  }

  try {
    // HEAD is cheap, but a fair number of docs hosts reject it — fall through
    // to GET rather than recording a false failure.
    let response = await attempt("HEAD");
    if (response.status === 405 || response.status === 403 || response.status === 501) {
      response = await attempt("GET");
    }

    return {
      ok: response.ok,
      status: response.status,
      detail: response.ok ? `Reachable (HTTP ${response.status})` : `Returned HTTP ${response.status}`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: null,
      detail: message.includes("abort") ? `No response within ${timeoutMs / 1000}s` : message
    };
  }
}
