/** Experiment-only station cutoffs, deliberately applied across all horizons. */
export const LONG_BEACH_THRESHOLDS: Record<string, number> = {
  "B-5": 0.58, "B-60": 0.57, "B-7": 0.54, "B-8": 0.51,
  "B-10": 0.60, "B-31": 0.70, "B-14": 0.66, "B-67": 0.66, "B-22": 0.65,
};

/** 100 * sigmoid(logit(p) - logit(t)), without log(0) at the endpoints.
 * This is a standardized score, not a calibrated exceedance probability.
 */
export function neptuneIndex(probability: number, threshold: number): number {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError("Probability must be finite and between 0 and 1.");
  }
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) {
    throw new RangeError("Threshold must be finite and strictly between 0 and 1.");
  }
  if (probability === 0 || probability === 1) return probability * 100;
  if (probability === threshold) return 50;
  if (threshold === 0.5) return probability * 100;
  const numerator = probability * (1 - threshold);
  return 100 * (numerator / (numerator + (1 - probability) * threshold));
}

// Truncate so a below-boundary value never rounds up into the next category.
export function displayedNeptuneIndex(probability: number, threshold: number): number {
  return Math.floor(neptuneIndex(probability, threshold));
}
