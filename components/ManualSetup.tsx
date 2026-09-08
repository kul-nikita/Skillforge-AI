"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { button, input, label } from "@/lib/ui";
import type { Role } from "@/lib/types";

/**
 * The floor under the conversation.
 *
 * Onboarding is step one: without a goal there is no roadmap, no diagnostic and
 * no dashboard, so a model outage here used to lock a learner out of the whole
 * product with a 502. Everything the conversation would have inferred can be
 * stated directly, and the same PUT saves it.
 */
export function ManualSetup({ roles, onBack }: { roles: Role[]; onBack: () => void }) {
  const router = useRouter();
  const [targetRoleId, setTargetRoleId] = useState(roles[0]?.id ?? "");
  const [weeklyHours, setWeeklyHours] = useState(8);
  const [timelineWeeks, setTimelineWeeks] = useState(12);
  const [cost, setCost] = useState<"free" | "any">("free");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = roles.find((candidate) => candidate.id === targetRoleId);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRoleId,
          careerObjective: role ? `Become a ${role.title}` : "Build job-ready skills",
          experienceLevel: "beginner",
          currentSkills: [],
          interests: [],
          learningHistory: [],
          preferredTechnologies: [],
          learningStyle: "unknown",
          timelineWeeks,
          weeklyHours,
          preferences: { maxHoursPerStep: 3, cost, format: "any" },
          consentGiven: true
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Could not save that.");
        return;
      }

      router.push("/diagnostic");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={save}>
      <div>
        <label className={label} htmlFor="role">
          What are you aiming at?
        </label>
        <select
          className={input}
          id="role"
          onChange={(event) => setTargetRoleId(event.target.value)}
          value={targetRoleId}
        >
          {roles.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title}
            </option>
          ))}
        </select>
        {role && <p className="mt-1.5 text-sm text-muted">{role.description}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="hours">
            Hours a week
          </label>
          <input
            className={input}
            id="hours"
            max={60}
            min={1}
            onChange={(event) => setWeeklyHours(Number(event.target.value))}
            type="number"
            value={weeklyHours}
          />
        </div>
        <div>
          <label className={label} htmlFor="weeks">
            Weeks you have
          </label>
          <input
            className={input}
            id="weeks"
            max={52}
            min={1}
            onChange={(event) => setTimelineWeeks(Number(event.target.value))}
            type="number"
            value={timelineWeeks}
          />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="cost">
          Resources
        </label>
        <select
          className={input}
          id="cost"
          onChange={(event) => setCost(event.target.value as "free" | "any")}
          value={cost}
        >
          <option value="free">Free only</option>
          <option value="any">Free or paid</option>
        </select>
      </div>

      {error && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button className={button.primary} disabled={busy || !targetRoleId} type="submit">
          {busy ? "Saving…" : "Save and continue"}
        </button>
        <button className={button.secondary} onClick={onBack} type="button">
          Try describing it instead
        </button>
      </div>
    </form>
  );
}
