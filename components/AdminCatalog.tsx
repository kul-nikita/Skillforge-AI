"use client";

import { useState } from "react";
import { AlertTriangle, Check, Database, Loader2, Plus, Trash2, X } from "lucide-react";
import type { LearningResource } from "@/lib/types";

type StoreState = { mongo: boolean; neo4j: boolean; qdrant: boolean };
type Issue = { field: string; message: string };

const BLANK = {
  id: "",
  title: "",
  provider: "",
  url: "",
  resourceType: "course",
  skillTags: "",
  difficulty: "beginner",
  durationMinutes: 60,
  costType: "free",
  qualityScore: 0.8,
  prerequisites: "",
  evidenceType: "",
  description: ""
};

const INPUT =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-teal";

const ids = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

export function AdminCatalog({
  initialResources,
  skillIds
}: {
  initialResources: LearningResource[];
  skillIds: string[];
}) {
  const [resources, setResources] = useState(initialResources);
  const [form, setForm] = useState(BLANK);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreState | null>(null);
  const [newHost, setNewHost] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  /** Fields the page did not state, so they are visibly blank rather than guessed. */
  const [notStated, setNotStated] = useState<string[]>([]);
  const [autofill, setAutofill] = useState<string | null>(null);

  function set<K extends keyof typeof BLANK>(key: K, value: (typeof BLANK)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  /**
   * Reads the record off the page the admin pasted. Nothing is saved, and a
   * field the page did not state stays empty and is listed — a plausible
   * duration nobody checked is worse than an empty box.
   */
  async function fillFromPage() {
    if (!form.url.trim()) return;

    setBusy(true);
    setAutofill(null);
    setNotStated([]);
    setIssues([]);

    try {
      const res = await fetch("/api/admin/resources/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: form.url.trim() })
      });
      const data = await res.json();

      if (!res.ok) {
        setAutofill(typeof data.error === "string" ? data.error : "Could not read that page.");
        return;
      }

      const f = data.fields;

      setForm((current) => ({
        ...current,
        // Only overwrite what the page actually stated; a null leaves whatever
        // the admin already typed.
        title: f.title ?? current.title,
        provider: f.provider ?? current.provider,
        description: f.description ?? current.description,
        resourceType: f.resourceType ?? current.resourceType,
        difficulty: f.difficulty ?? current.difficulty,
        durationMinutes: f.durationMinutes ?? current.durationMinutes,
        costType: f.costType ?? current.costType,
        skillTags: f.skillTags.length > 0 ? f.skillTags.join(", ") : current.skillTags,
        id:
          current.id ||
          (f.title ?? "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 60)
      }));

      setNotStated(f.notStated ?? []);
      setAutofill(
        [
          data.duplicateOf ? `This URL is already in the catalog as ${data.duplicateOf}.` : null,
          data.hostAllowed ? null : `${data.host} is outside the sourcing allowlist — saving will ask you to confirm.`,
          "Read from the page. Check every field before saving."
        ]
          .filter(Boolean)
          .join(" ")
      );
    } catch {
      setAutofill("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function save(allowNewDomain: boolean) {
    setBusy(true);
    setIssues([]);
    setStatus(null);
    setStores(null);
    if (!allowNewDomain) {
      setNewHost(null);
    }

    try {
      const res = await fetch("/api/admin/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          durationMinutes: Number(form.durationMinutes),
          qualityScore: Number(form.qualityScore),
          skillTags: ids(form.skillTags),
          prerequisites: ids(form.prerequisites),
          evidenceType: form.evidenceType.trim() || null,
          allowNewDomain
        })
      });
      const data = await res.json();

      if (res.status === 409 && data.error === "new_domain") {
        setNewHost(data.host);
        return;
      }

      if (!res.ok) {
        const fieldErrors = data.error?.fieldErrors as Record<string, string[]> | undefined;
        setIssues(
          data.issues ??
            (fieldErrors
              ? Object.entries(fieldErrors).map(([field, messages]) => ({
                  field,
                  message: messages.join(", ")
                }))
              : [{ field: "form", message: String(data.message ?? "Save failed.") }])
        );
        return;
      }

      setResources((current) => [
        data.resource,
        ...current.filter((row) => row.id !== data.resource.id)
      ]);
      setStores(data.stores);
      setStatus(
        data.warning ?? `Saved. URL check: ${data.urlCheck.detail}. Written to all three stores.`
      );
      setForm(BLANK);
      setNewHost(null);
    } catch {
      setIssues([{ field: "form", message: "Could not reach the server." }]);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/resources?id=${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(String(data.error ?? "Delete failed."));
        return;
      }
      setResources((current) => current.filter((row) => row.id !== id));
      setStores(data.stores);
      setStatus(`Removed "${id}" from MongoDB, Neo4j and Qdrant.`);
    } finally {
      setBusy(false);
    }
  }

  const visible = resources.filter((row) =>
    `${row.title} ${row.provider} ${row.skillTags.join(" ")}`
      .toLowerCase()
      .includes(filter.toLowerCase())
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <Plus aria-hidden="true" className="text-teal" size={20} />
          <h2 className="text-lg font-semibold text-ink">Add or update a resource</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">
          The server fetches the URL before storing anything, so a row can only claim to be verified
          if it actually resolved. Skill ids are checked against the graph, and the write lands in
          MongoDB, Neo4j and Qdrant together.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Id (slug)">
            <input
              className={INPUT}
              onChange={(event) => set("id", event.target.value)}
              placeholder="owasp-top-ten"
              value={form.id}
            />
          </Field>
          <Field label="Provider">
            <input
              className={INPUT}
              onChange={(event) => set("provider", event.target.value)}
              placeholder="OWASP"
              value={form.provider}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Title">
              <input
                className={INPUT}
                onChange={(event) => set("title", event.target.value)}
                value={form.title}
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="URL">
              <div className="flex gap-2">
                <input
                  className={INPUT}
                  onChange={(event) => set("url", event.target.value)}
                  placeholder="https://owasp.org/www-project-top-ten/"
                  value={form.url}
                />
                <button
                  className="shrink-0 rounded-md border border-teal px-3 text-sm font-medium text-teal hover:bg-teal/10 disabled:opacity-40"
                  disabled={busy || !form.url.trim()}
                  onClick={() => void fillFromPage()}
                  type="button"
                >
                  {busy ? "Reading…" : "Autofill from page"}
                </button>
              </div>
            </Field>
            {autofill && (
              <p className="mt-2 rounded-md border border-cyan-300/20 bg-cyan-300/5 p-3 text-xs leading-5 text-cyan-100">
                {autofill}
              </p>
            )}
            {notStated.length > 0 && (
              <p className="mt-2 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-200">
                The page did not state: {notStated.join(", ")}. These were left as they were — fill
                them in yourself rather than accepting the default.
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <Field label="Description">
              <textarea
                className={`${INPUT} h-20`}
                onChange={(event) => set("description", event.target.value)}
                value={form.description}
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label={`Teaches — skill ids, comma separated (${skillIds.length} in the graph)`}>
              <input
                className={INPUT}
                list="skill-ids"
                onChange={(event) => set("skillTags", event.target.value)}
                placeholder="web-security-basics"
                value={form.skillTags}
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Requires first — skill ids, comma separated">
              <input
                className={INPUT}
                list="skill-ids"
                onChange={(event) => set("prerequisites", event.target.value)}
                value={form.prerequisites}
              />
            </Field>
          </div>

          <datalist id="skill-ids">
            {skillIds.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>

          <Field label="Type">
            <select
              className={INPUT}
              onChange={(event) => set("resourceType", event.target.value)}
              value={form.resourceType}
            >
              {["course", "lab", "doc", "project", "video"].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </Field>

          <Field label="Difficulty">
            <select
              className={INPUT}
              onChange={(event) => set("difficulty", event.target.value)}
              value={form.difficulty}
            >
              {["beginner", "intermediate", "advanced"].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </Field>

          <Field label="Duration (minutes)">
            <input
              className={INPUT}
              onChange={(event) => set("durationMinutes", Number(event.target.value))}
              type="number"
              value={form.durationMinutes}
            />
          </Field>

          <Field label="Cost">
            <select
              className={INPUT}
              onChange={(event) => set("costType", event.target.value)}
              value={form.costType}
            >
              {["free", "freemium", "paid"].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </Field>

          <Field label="Quality (0–1)">
            <input
              className={INPUT}
              max={1}
              min={0}
              onChange={(event) => set("qualityScore", Number(event.target.value))}
              step={0.05}
              type="number"
              value={form.qualityScore}
            />
          </Field>

          <Field label="Evidence type (blank for none)">
            <input
              className={INPUT}
              onChange={(event) => set("evidenceType", event.target.value)}
              placeholder="lab-completion"
              value={form.evidenceType}
            />
          </Field>
        </div>

        {newHost ? (
          <div className="mt-4 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-amber-200"
                size={16}
              />
              <div>
                <p className="font-medium text-ink">
                  <code>{newHost}</code> is not in the sourcing allowlist.
                </p>
                <p className="mt-1 text-muted">
                  The catalog only draws from vetted providers. Add it only if you trust this one.
                </p>
                <button
                  className="mt-2 rounded-md bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500/30"
                  disabled={busy}
                  onClick={() => save(true)}
                  type="button"
                >
                  Trust {newHost} and save
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {issues.length > 0 ? (
          <ul className="mt-4 space-y-1 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {issues.map((issue) => (
              <li className="flex gap-2" key={`${issue.field}-${issue.message}`}>
                <X aria-hidden="true" className="mt-0.5 shrink-0" size={14} />
                <span>
                  <strong className="font-medium">{issue.field}</strong> — {issue.message}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {status ? (
          <div className="mt-4 rounded-md border border-border bg-canvas p-3 text-sm text-ink">
            <p>{status}</p>
            {stores ? (
              <ul className="mt-2 flex flex-wrap gap-3 text-xs">
                {(["mongo", "neo4j", "qdrant"] as const).map((store) => (
                  <li className="flex items-center gap-1" key={store}>
                    {stores[store] ? (
                      <Check aria-hidden="true" className="text-teal" size={14} />
                    ) : (
                      <X aria-hidden="true" className="text-red-600" size={14} />
                    )}
                    <span className="uppercase tracking-wide text-muted">{store}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <button
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-teal px-4 text-sm font-semibold text-white hover:bg-teal-strong disabled:opacity-60"
          disabled={busy}
          onClick={() => save(false)}
          type="button"
        >
          {busy ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
          Verify URL and save
        </button>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <Database aria-hidden="true" className="text-teal" size={20} />
          <h2 className="text-lg font-semibold text-ink">Catalog ({resources.length})</h2>
        </div>

        <input
          className={`${INPUT} mt-3`}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by title, provider or skill…"
          value={filter}
        />

        <ul className="mt-4 max-h-[38rem] space-y-2 overflow-y-auto pr-1">
          {visible.map((row) => (
            <li className="rounded-md border border-border p-3" key={row.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{row.title}</p>
                  <p className="text-xs text-muted">
                    {row.provider} · {row.resourceType} · {row.durationMinutes} min · {row.costType}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted">
                    teaches: {row.skillTags.join(", ") || "—"}
                  </p>
                  <p className="text-xs text-muted">verified {row.lastVerifiedAt}</p>
                </div>
                <button
                  aria-label={`Remove ${row.title}`}
                  className="shrink-0 rounded-md border border-border p-2 text-muted hover:border-red-500/40 hover:text-red-600 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => remove(row.id)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={15} />
                </button>
              </div>
            </li>
          ))}
          {visible.length === 0 ? (
            <li className="py-6 text-center text-sm text-muted">Nothing matches that filter.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
