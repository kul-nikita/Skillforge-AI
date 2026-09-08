"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { button, card, input, label } from "@/lib/ui";
import type { LearnerProfile, Role } from "@/lib/types";

const EXPERIENCE = ["beginner", "intermediate", "advanced"] as const;
const STYLES = ["hands-on", "visual", "reading", "mixed", "unknown"] as const;

const list = (values: string[]) => values.join(", ");
const parseList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * The learner profile, visible and editable.
 *
 * Onboarding captured objective, experience, interests, history, technologies
 * and style, then nothing ever read them back — the learner could not see what
 * had been inferred about them, let alone correct it. Everything here saves
 * through the same validated PUT that onboarding uses.
 */
export function ProfilePanel({
  profile,
  roles,
  consentGiven
}: {
  profile: LearnerProfile;
  roles: Role[];
  consentGiven: boolean;
}) {
  const [draft, setDraft] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function set<K extends keyof LearnerProfile>(key: K, value: LearnerProfile[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setNote(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);

    try {
      const res = await fetch("/api/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRoleId: draft.targetRoleId,
          careerObjective: draft.careerObjective,
          experienceLevel: draft.experienceLevel,
          currentSkills: draft.currentSkills,
          interests: draft.interests,
          learningHistory: draft.learningHistory,
          preferredTechnologies: draft.preferredTechnologies,
          learningStyle: draft.learningStyle,
          timelineWeeks: draft.timelineWeeks,
          weeklyHours: draft.weeklyHours,
          preferences: draft.preferences,
          consentGiven
        })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not save your profile.");
        return;
      }

      setNote("Profile saved. Your roadmap uses it from the next page load.");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`${card} p-5`} onSubmit={save}>
      <h2 className="text-base font-semibold tracking-tight text-ink">Your profile</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        What we understood from your goal. Correct anything that is wrong — the mentor and your
        roadmap read from this.
      </p>

      <div className="mt-5 space-y-4">
        <div>
          <label className={label} htmlFor="p-role">
            Target role
          </label>
          <select
            className={input}
            id="p-role"
            onChange={(event) => set("targetRoleId", event.target.value)}
            value={draft.targetRoleId}
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={label} htmlFor="p-objective">
            Objective
          </label>
          <input
            className={input}
            id="p-objective"
            maxLength={200}
            onChange={(event) => set("careerObjective", event.target.value)}
            value={draft.careerObjective}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="p-experience">
              Experience level
            </label>
            <select
              className={input}
              id="p-experience"
              onChange={(event) => set("experienceLevel", event.target.value as LearnerProfile["experienceLevel"])}
              value={draft.experienceLevel}
            >
              {EXPERIENCE.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="p-style">
              How you like to learn
            </label>
            <select
              className={input}
              id="p-style"
              onChange={(event) => set("learningStyle", event.target.value as LearnerProfile["learningStyle"])}
              value={draft.learningStyle}
            >
              {STYLES.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="p-hours">
              Hours a week
            </label>
            <input
              className={input}
              id="p-hours"
              max={60}
              min={1}
              onChange={(event) => set("weeklyHours", Number(event.target.value))}
              type="number"
              value={draft.weeklyHours}
            />
          </div>
          <div>
            <label className={label} htmlFor="p-weeks">
              Weeks you have
            </label>
            <input
              className={input}
              id="p-weeks"
              max={52}
              min={1}
              onChange={(event) => set("timelineWeeks", Number(event.target.value))}
              type="number"
              value={draft.timelineWeeks}
            />
          </div>
        </div>

        {(
          [
            ["interests", "Interests", "e.g. threat detection, automation"],
            ["currentSkills", "What you already know", "e.g. Python, Linux"],
            ["preferredTechnologies", "Tools you prefer", "e.g. Splunk, Wireshark"],
            ["learningHistory", "Courses and training you have done", "e.g. CS50, a networking bootcamp"]
          ] as const
        ).map(([key, labelText, placeholder]) => (
          <div key={key}>
            <label className={label} htmlFor={`p-${key}`}>
              {labelText}
            </label>
            <input
              className={input}
              id={`p-${key}`}
              onChange={(event) => set(key, parseList(event.target.value))}
              placeholder={placeholder}
              value={list(draft[key])}
            />
            <p className="mt-1 text-xs text-muted">Separate with commas.</p>
          </div>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      {note && <p className="mt-4 text-sm text-cyan-300">{note}</p>}

      <div className="mt-5">
        <button className={button.primary} disabled={busy} type="submit">
          {busy ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}
