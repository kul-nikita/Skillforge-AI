import { createHmac, timingSafeEqual } from "node:crypto";

const ALGORITHM = "sha256";

// Falls back rather than throwing: a missing secret must not break the
// learn -> prove loop locally. Signatures stay internally consistent, they are
// just not unforgeable. Set EVIDENCE_SIGNING_SECRET wherever a shared evidence
// link has to mean something.
const DEV_FALLBACK_SECRET = "skillforge-dev-evidence-signing-secret";
let warnedAboutFallback = false;

function getSecret(): string {
  const secret = process.env.EVIDENCE_SIGNING_SECRET;
  if (secret) {
    return secret;
  }
  if (!warnedAboutFallback) {
    console.warn(
      "[signing] EVIDENCE_SIGNING_SECRET is not set — using a well-known dev key. " +
        "Evidence signatures will not be unforgeable. Set it before relying on /verify."
    );
    warnedAboutFallback = true;
  }
  return DEV_FALLBACK_SECRET;
}

/** Canonical form for signing: field order fixed here, not by object literal order. */
export function serializeEvidence(data: {
  id: string;
  skillId: string;
  resourceId: string;
  summary: string;
  evidenceType: string;
  artifactUrl: string | null;
  rubricScore: number;
  validatedCapabilities: string[];
  createdAt: string;
}): string {
  return JSON.stringify({
    id: data.id,
    skillId: data.skillId,
    resourceId: data.resourceId,
    summary: data.summary,
    evidenceType: data.evidenceType,
    artifactUrl: data.artifactUrl,
    rubricScore: data.rubricScore,
    validatedCapabilities: data.validatedCapabilities,
    createdAt: data.createdAt
  });
}

/** HMAC-SHA256 over the canonical form, hex encoded. */
export function signEvidence(data: {
  id: string;
  skillId: string;
  resourceId: string;
  summary: string;
  evidenceType: string;
  artifactUrl: string | null;
  rubricScore: number;
  validatedCapabilities: string[];
  createdAt: string;
}): string {
  const secret = getSecret();
  const payload = serializeEvidence(data);
  return createHmac(ALGORITHM, secret).update(payload).digest("hex");
}

/** Constant-time comparison, so a signature cannot be guessed byte by byte. */
export function verifyEvidenceSignature(
  data: {
    id: string;
    skillId: string;
    resourceId: string;
    summary: string;
    evidenceType: string;
    artifactUrl: string | null;
    rubricScore: number;
    validatedCapabilities: string[];
    createdAt: string;
  },
  signature: string
): boolean {
  try {
    const expected = signEvidence(data);
    const sigBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Short-lived signed tokens meaning "the server issued exactly these questions".
 * Both graded flows would otherwise take the questions from the request body,
 * which lets a learner grade themselves. There is no per-attempt server state,
 * so the server signs what it handed out and demands it back.
 */
function b64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function issueToken(claims: Record<string, unknown>, ttlMs: number): string {
  const body = b64url(JSON.stringify({ ...claims, exp: Date.now() + ttlMs }));
  return `${body}.${createHmac(ALGORITHM, getSecret()).update(body).digest("hex")}`;
}

/** Returns the claims, or null if the token is forged, malformed or expired. */
export function readToken(token: string): Record<string, unknown> | null {
  const [body, signature] = token.split(".");

  if (!body || !signature) {
    return null;
  }

  const expected = createHmac(ALGORITHM, getSecret()).update(body).digest("hex");
  const given = Buffer.from(signature, "hex");
  const want = Buffer.from(expected, "hex");

  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof claims !== "object" || claims === null || typeof claims.exp !== "number") {
      return null;
    }
    return claims.exp < Date.now() ? null : claims;
  } catch {
    return null;
  }
}

/** Stable fingerprint of a question set, so graded questions are the issued ones. */
export function fingerprint(values: string[]): string {
  return createHmac(ALGORITHM, getSecret()).update(JSON.stringify(values)).digest("hex").slice(0, 32);
}

/**
 * True when the token is ours, unexpired, and carries exactly these claims.
 * Arrays must match element for element: that is what stops a learner
 * submitting only the questions they got right.
 */
export function tokenMatches(token: string, expected: Record<string, string | string[]>): boolean {
  const claims = readToken(token);

  if (!claims) {
    return false;
  }

  return Object.entries(expected).every(([key, value]) => {
    const actual = claims[key];

    if (Array.isArray(value)) {
      return (
        Array.isArray(actual) &&
        actual.length === value.length &&
        actual.every((item, index) => String(item) === value[index])
      );
    }

    return actual === value;
  });
}
