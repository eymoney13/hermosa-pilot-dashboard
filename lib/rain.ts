import type { Conditions } from "./data";

// One place that decides what counts as rain, how much fell, and how to say the
// depth out loud.
//
// WHY THIS MODULE EXISTS. The summary paragraph and the contributing-factor
// list each used to answer "was there rain?" on their own, and they answered it
// differently. On a 0.7 mm day at Hermosa (Herondo St) the summary said "there
// has been no real rain" while the factor list directly underneath said "recent
// rain is washing bacteria off streets and storm drains into the water" -- the
// summary comparing a 4-day total against a runoff threshold, the factor list
// reading a SHAP sign that is non-zero for any rain at all. Both were right by
// their own rule and the card contradicted itself, with the number that would
// have reconciled them printed nowhere.
//
// So the rule lives here once, and both surfaces name the depth.

/**
 * The depth at which runoff starts to matter, 0.1 in.
 *
 * Not a round number picked for prose: it is the same cutoff the model's own
 * `wet` feature uses (precip over 3 days > 2.54 mm), so the text calls a day wet
 * exactly when the model does. Below it, a few tenths of a millimetre is dew on
 * the pavement, not a runoff event.
 */
export const WET_MM = 2.54;

/** What the day's rain amounts to, in the only three sizes worth wording. */
export type RainState = "none" | "trace" | "wet";

/**
 * Total rain behind one day: the day itself plus the three days before it.
 *
 * Null when the backend published neither figure, which is not the same as
 * zero -- a stale weather feed blanks these fields, and a blanked feed must not
 * be narrated as a dry spell. Callers fall back to wording that names no depth.
 */
export function rainTotalMm(c: Conditions | undefined): number | null {
  const today = c?.rainTodayMm;
  const prior = c?.rainPrior3dMm;
  if (today == null && prior == null) return null;
  return (today ?? 0) + (prior ?? 0);
}

/**
 * Which of the three states a depth falls in.
 *
 * `trace` is the state that did not exist before and caused the contradiction:
 * more than nothing, less than a runoff event. It reads as dry in the summary
 * and as rain in the model, and the only honest description says both.
 */
export function rainState(mm: number): RainState {
  if (mm <= 0) return "none";
  if (mm < WET_MM) return "trace";
  return "wet";
}

/** Format source rainfall in inches, preserving small nonzero amounts. */
export function rainDepth(mm: number): string {
  const inches = mm / 25.4;
  if (inches > 0 && inches < 0.01) return "<0.01 inches";
  return `${inches.toFixed(2)} inches`;
}
