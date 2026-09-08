"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

/**
 * `router.refresh()` after the POST is load-bearing: without it the server
 * components keep rendering the cached signed-in shell after the cookie is gone.
 */
export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className={className} disabled={busy} onClick={signOut} type="button">
      <LogOut aria-hidden="true" size={15} />
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
