/**
 * "about five months" -> 22 weeks. "a couple of evenings a week" -> 4 hours.
 *
 * Deliberately not a model call. The learner's opening sentence IS parsed by the
 * model — that is where phrasing is genuinely open-ended. These two fields are
 * a quantity and a unit, and a round-trip per keystroke would put a second of
 * latency and a network failure mode in front of a field that has neither.
 * Anything this cannot read is left for the learner to rewrite as a sentence,
 * which puts it back through the model where it belongs.
 */

const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  couple: 2,
  three: 3,
  few: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  half: 0.5
};

const WEEKS_PER_MONTH = 4.345;
const WEEKS_PER_YEAR = 52;

/** An evening or a night of study is not an hour — treating it as one halves the plan. */
const HOURS_PER_SESSION = 2;

function firstQuantity(text: string): number | null {
  const digits = text.match(/(\d+(?:\.\d+)?)/);
  if (digits) {
    return Number(digits[1]);
  }

  // The indefinite article is a number word only as a last resort: scanning
  // left to right made "a couple of evenings" mean one, not two.
  const words = text.split(/[^a-z]+/);
  const named = words.find((word) => word in WORD_NUMBERS && word !== "a" && word !== "an");

  if (named) {
    return WORD_NUMBERS[named];
  }

  return words.some((word) => word === "a" || word === "an") ? 1 : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Weeks, or null when the phrase names no readable duration. */
export function parseWeeks(text: string): number | null {
  const lower = text.toLowerCase();
  const quantity = firstQuantity(lower);

  if (quantity === null || quantity <= 0) {
    return null;
  }

  let weeks: number;
  if (/\byears?\b/.test(lower)) {
    weeks = quantity * WEEKS_PER_YEAR;
  } else if (/\bmonths?\b/.test(lower)) {
    weeks = quantity * WEEKS_PER_MONTH;
  } else if (/\bweeks?\b|\bwks?\b/.test(lower)) {
    weeks = quantity;
  } else {
    // A bare number here means weeks: the field asks for a timeline, and
    // guessing a unit the learner did not type would be worse than declining.
    weeks = /^\s*\d+(\.\d+)?\s*$/.test(lower) ? quantity : NaN;
  }

  return Number.isFinite(weeks) ? clamp(Math.round(weeks), 1, 52) : null;
}

/** Hours per week, or null when the phrase names no readable amount. */
export function parseHoursPerWeek(text: string): number | null {
  const lower = text.toLowerCase();
  const quantity = firstQuantity(lower);

  if (quantity === null || quantity <= 0) {
    return null;
  }

  let hours: number;
  if (/\bevenings?\b|\bnights?\b|\bsessions?\b|\bdays?\b/.test(lower)) {
    hours = quantity * HOURS_PER_SESSION;
  } else if (/\bhours?\b|\bhrs?\b|\bh\b/.test(lower)) {
    hours = quantity;
  } else {
    hours = /^\s*\d+(\.\d+)?\s*$/.test(lower) ? quantity : NaN;
  }

  return Number.isFinite(hours) ? clamp(Math.round(hours * 2) / 2, 1, 60) : null;
}
