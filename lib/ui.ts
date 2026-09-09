/**
 * Shared class strings rather than wrapper components: some of these render as
 * links and some as buttons, and a string works for both.
 *
 * The palette is deliberately restrained. A violet-to-cyan gradient with a glow
 * on every primary button is the house style of every generated dashboard on
 * the internet; here the accent is spent on state — what is active, what is
 * ready, what is blocked — and the primary action is simply the highest
 * contrast thing on the page.
 */
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-md px-4 text-sm font-medium " +
  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none " +
  "disabled:opacity-40";

export const button = {
  primary: `${BUTTON_BASE} h-10 bg-ink font-semibold text-canvas hover:bg-white`,
  secondary: `${BUTTON_BASE} h-10 border border-border-strong bg-transparent text-ink hover:border-white/35 hover:bg-white/5`,
  ghost: `${BUTTON_BASE} h-9 text-muted hover:bg-white/5 hover:text-ink`,
  danger: `${BUTTON_BASE} h-10 border border-red-500/40 bg-transparent text-red-300 hover:border-red-400/70 hover:bg-red-500/10`
};

export const card = "rounded-lg border border-border bg-surface";

export const input =
  "w-full rounded-md border border-border bg-surface-sunken px-3 py-2 text-sm text-ink " +
  "outline-none transition-colors placeholder:text-muted/70 focus:border-white/25 focus:ring-1 focus:ring-white/20";

/** Sentence case, not the all-caps micro-label every generated dashboard uses. */
export const label = "mb-1.5 block text-sm font-medium text-ink";

/** For the small line above a value in a stat block. */
export const eyebrow = "text-xs font-medium text-muted";

/** Numbers are the point of this product, so they get their own treatment. */
export const figure = "font-display text-3xl font-semibold tabular-nums tracking-tight text-ink";

/**
 * The three mastery states, coloured once. Gap analysis and role readiness had
 * their own copies of this map, which is how they drifted into looking like two
 * unrelated features.
 */
export const STATUS_TONE: Record<"mastered" | "partial" | "missing", string> = {
  mastered: "bg-emerald-500/10 text-emerald-300",
  partial: "bg-amber-500/10 text-amber-300",
  missing: "bg-red-500/10 text-red-300"
};
