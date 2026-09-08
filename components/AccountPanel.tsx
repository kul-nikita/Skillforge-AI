"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Download, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { button, card } from "@/lib/ui";

/** The UI half of product rule 5: view, export, and delete everything we hold. */
export function AccountPanel({
  email,
  initialConsent,
  counts
}: {
  email: string;
  initialConsent: boolean;
  counts: { events: number; evidence: number; hasProfile: boolean };
}) {
  const router = useRouter();
  const [consent, setConsent] = useState(initialConsent);
  const [busy, setBusy] = useState<null | "consent" | "export" | "delete">(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function toggleConsent(next: boolean) {
    setBusy("consent");
    setNote(null);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentGiven: next })
      });
      if (!res.ok) {
        setNote("Could not update consent.");
        return;
      }
      setConsent(next);
      setNote(
        next
          ? "Consent given. New diagnostics and completions will be saved."
          : "Consent withdrawn. Nothing new will be stored; existing data is untouched until you delete it."
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function exportData() {
    setBusy("export");
    setNote(null);
    try {
      const res = await fetch("/api/account");
      if (!res.ok) {
        setNote("Could not export your data.");
        return;
      }
      // Built from the response rather than linking straight at the endpoint,
      // so the file lands with a sensible name instead of "account".
      const blob = new Blob([JSON.stringify(await res.json(), null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `skillforge-${email.replace(/[^a-z0-9]+/gi, "-")}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNote("Downloaded everything we hold about you as JSON.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    setBusy("delete");
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        setNote("Could not delete the account.");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className={`${card} p-6`}>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <ShieldCheck aria-hidden="true" className="text-teal" size={18} />
          Consent
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Your diagnostic answers and completions are only analysed and stored while this is on.
          Turning it off stops new data being written immediately — it does not delete what is
          already there, which is what the button below is for.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            aria-pressed={consent}
            className={consent ? button.secondary : button.primary}
            disabled={busy !== null}
            onClick={() => toggleConsent(!consent)}
            type="button"
          >
            {busy === "consent" ? (
              <Loader2 aria-hidden="true" className="animate-spin" size={15} />
            ) : null}
            {consent ? "Withdraw consent" : "Give consent"}
          </button>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              consent ? "bg-teal-subtle text-teal-strong" : "bg-surface-sunken text-muted"
            }`}
          >
            {consent ? <Check aria-hidden="true" size={13} /> : null}
            {consent ? "Consent given" : "No consent on file"}
          </span>
        </div>
      </section>

      <section className={`${card} p-6`}>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Download aria-hidden="true" className="text-teal" size={18} />
          Your data
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Learning events", value: String(counts.events) },
            { label: "Evidence records", value: String(counts.evidence) },
            { label: "Profile", value: counts.hasProfile ? "Saved" : "None yet" }
          ].map((stat) => (
            <div className="rounded-lg bg-surface-sunken px-4 py-3" key={stat.label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                {stat.label}
              </dt>
              <dd className="tnum mt-1 text-xl font-semibold text-ink">{stat.value}</dd>
            </div>
          ))}
        </dl>
        <button
          className={`${button.secondary} mt-4`}
          disabled={busy !== null}
          onClick={exportData}
          type="button"
        >
          {busy === "export" ? (
            <Loader2 aria-hidden="true" className="animate-spin" size={15} />
          ) : (
            <Download aria-hidden="true" size={15} />
          )}
          Export as JSON
        </button>
      </section>

      <section className={`${card} border-red-500/40 p-6`}>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <AlertTriangle aria-hidden="true" className="text-red-600" size={18} />
          Delete account
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Removes your profile, every learning event, and your evidence wallet, then signs you out
          everywhere. This cannot be undone — export first if you want a copy.
        </p>

        {confirming ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              className={button.danger}
              disabled={busy !== null}
              onClick={deleteAccount}
              type="button"
            >
              {busy === "delete" ? (
                <Loader2 aria-hidden="true" className="animate-spin" size={15} />
              ) : (
                <Trash2 aria-hidden="true" size={15} />
              )}
              Yes, delete everything
            </button>
            <button
              className={button.secondary}
              disabled={busy !== null}
              onClick={() => setConfirming(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button className={`${button.danger} mt-4`} onClick={() => setConfirming(true)} type="button">
            <Trash2 aria-hidden="true" size={15} />
            Delete my account
          </button>
        )}
      </section>

      {note ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-ink" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
