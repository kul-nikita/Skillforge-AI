/**
 * Shared class strings rather than wrapper components: some of these render as
 * links and some as buttons, and a string works for both.
 */
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold " +
  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none " +
  "disabled:opacity-50";

export const button = {
  primary: `${BUTTON_BASE} h-10 bg-gradient-to-r from-violet-600 via-blue-500 to-cyan-400 text-white shadow-[0_0_22px_rgba(56,189,248,0.18)] hover:brightness-110`,
  secondary: `${BUTTON_BASE} h-10 border border-border bg-surface text-ink shadow-sm hover:border-teal-soft hover:bg-surface-sunken`,
  ghost: `${BUTTON_BASE} h-9 text-muted hover:bg-surface-sunken hover:text-ink`,
  danger: `${BUTTON_BASE} h-10 border border-red-500/40 bg-red-500/10 text-red-300 shadow-sm hover:border-red-400/70 hover:bg-red-500/20`
};

export const card = "rounded-xl border border-border bg-surface shadow-card";

export const input =
  "w-full rounded-lg border border-border bg-surface-sunken px-3 py-2 text-sm text-ink shadow-inner-hairline " +
  "outline-none transition-colors placeholder:text-muted/70 focus:border-teal-soft focus:ring-2 focus:ring-teal-soft/40";

export const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-muted";
