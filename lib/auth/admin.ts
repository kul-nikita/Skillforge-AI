import type { User } from "@/lib/db/users";
import { normalizeEmail } from "@/lib/db/users";

/**
 * An env allowlist rather than a roles table: this catalog has one curator.
 * Unset means nobody is an admin, so the catalog is closed by default.
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
}

export function isAdmin(user: Pick<User, "email"> | null | undefined): boolean {
  return Boolean(user && adminEmails().includes(normalizeEmail(user.email)));
}
