import { describe, expect, it, vi, afterEach } from "vitest";
import { fingerprint, issueToken, readToken, tokenMatches } from "./signing";

/**
 * These tokens are the only thing standing between "graded by the server" and
 * "graded on whatever the client felt like being asked".
 */
describe("issued-question tokens", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips its claims", () => {
    const token = issueToken({ k: "check", u: "user-1", q: ["a", "b"] }, 60_000);
    expect(readToken(token)).toMatchObject({ k: "check", u: "user-1", q: ["a", "b"] });
  });

  it("rejects a tampered body", () => {
    const token = issueToken({ k: "check", u: "user-1" }, 60_000);
    const [body, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ k: "check", u: "user-2", exp: Date.now() + 60_000 }),
      "utf8"
    ).toString("base64url");

    expect(body).not.toBe(forged);
    expect(readToken(`${forged}.${signature}`)).toBeNull();
  });

  it("rejects garbage and truncated tokens", () => {
    expect(readToken("")).toBeNull();
    expect(readToken("nope")).toBeNull();
    expect(readToken("a.b")).toBeNull();
  });

  it("expires", () => {
    vi.useFakeTimers();
    const token = issueToken({ k: "check" }, 1000);
    expect(readToken(token)).not.toBeNull();

    vi.advanceTimersByTime(1001);
    expect(readToken(token)).toBeNull();
  });

  it("matches only the exact claims it was issued with", () => {
    const token = issueToken({ k: "check", u: "user-1", r: "res-1", q: ["q1", "q2"] }, 60_000);

    expect(tokenMatches(token, { k: "check", u: "user-1", r: "res-1", q: ["q1", "q2"] })).toBe(true);
    expect(tokenMatches(token, { k: "check", u: "user-2", r: "res-1", q: ["q1", "q2"] })).toBe(false);
    expect(tokenMatches(token, { k: "check", u: "user-1", r: "res-2", q: ["q1", "q2"] })).toBe(false);
    expect(tokenMatches(token, { k: "interview", u: "user-1", r: "res-1", q: ["q1", "q2"] })).toBe(false);
  });

  it("refuses a subset of the issued questions", () => {
    // The whole point: answer three, submit only the one you got right.
    const token = issueToken({ k: "check", u: "u", r: "r", q: ["q1", "q2", "q3"] }, 60_000);

    expect(tokenMatches(token, { k: "check", u: "u", r: "r", q: ["q1"] })).toBe(false);
    expect(tokenMatches(token, { k: "check", u: "u", r: "r", q: ["q1", "q2"] })).toBe(false);
    expect(tokenMatches(token, { k: "check", u: "u", r: "r", q: ["q1", "q2", "q3", "q4"] })).toBe(false);
    expect(tokenMatches(token, { k: "check", u: "u", r: "r", q: ["q1", "q2", "q3"] })).toBe(true);
  });

  it("fingerprints question text, so swapped questions are a different set", () => {
    expect(fingerprint(["a", "b"])).toBe(fingerprint(["a", "b"]));
    expect(fingerprint(["a", "b"])).not.toBe(fingerprint(["b", "a"]));
    expect(fingerprint(["a", "b"])).not.toBe(fingerprint(["a", "b ", ""]));
  });
});
