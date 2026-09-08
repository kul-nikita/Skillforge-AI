import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/mongo";
import { findUserById, type User } from "@/lib/db/users";
import { SESSION_COOKIE } from "@/lib/constants";

const SESSION_DAYS = 30;

type SessionRecord = {
  tokenHash: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
};

async function sessions() {
  return (await getDb()).collection<SessionRecord>("sessions");
}

/**
 * Only a hash is persisted, so a database leak hands over no usable sessions.
 * Server-side records rather than a JWT, so logout and deletion revoke at once.
 */
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await (await sessions()).insertOne({ tokenHash: hashToken(token), userId, createdAt: new Date(), expiresAt });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const record = await (await sessions()).findOne({ tokenHash: hashToken(token) });

  if (!record || record.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return findUserById(record.userId);
}

/** Throws for API routes that must not proceed anonymously. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }

  return user;
}

/**
 * For server components. Middleware only checks that a cookie exists, so a
 * revoked or forged one reaches the page and must redirect, not 500.
 */
export async function requireUserOrRedirect(nextPath: string): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return user;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (token) {
    await (await sessions()).deleteOne({ tokenHash: hashToken(token) });
  }

  jar.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string) {
  await (await sessions()).deleteMany({ userId });
}
