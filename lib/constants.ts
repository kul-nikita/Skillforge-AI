/** Owner of the seeded sample wallet; real learners are keyed by their user id. */
export const DEMO_LEARNER_ID = "demo-learner";

/**
 * Defined here rather than in lib/auth/session.ts so `middleware.ts` can import
 * it: middleware runs on the Edge runtime and must not pull in the Mongo driver.
 */
export const SESSION_COOKIE = "sf_session";

export const DEFAULT_PREFERENCES = {
  maxHoursPerStep: 4,
  cost: "free",
  format: "lab"
} as const;

export const DEFAULT_WEEKLY_HOURS = 8;
