// Per-location feature flags — the single source of truth for which
// experimental features each dashboard shows.
//
// The defaults below ARE the current, stable behavior: every flag off. A
// location only sees a feature when it explicitly opts in via
// FEATURES_BY_LOCATION, so Manhattan (whose entry is empty) always renders
// today's behavior and cannot regress unless a flag is deliberately added to
// its entry. `hermosa` is the mock/test board — new features are flipped on
// here first, then promoted to other locations once proven.

export interface FeatureFlags {
  // Header label reads "Current conditions for <date>" instead of
  // "Forecast for <date>".
  currentConditionsLabel: boolean;
  // Big "Neptune Index" (0–100, the exceedance percent) on the right of the
  // banner, tracking the selected beach.
  neptuneIndex: boolean;
  // Render exceedance figures as bare numbers (e.g. "41") instead of "41%".
  hidePercentSign: boolean;
  // Hide the exceedance readout row — the number pill, its "probability of
  // unsafe bacteria levels" label, and the info tooltip — keeping the gradient
  // scale bar above it and the risk-tier legend below it.
  hideExceedanceReadout: boolean;
  // Replace the 3-tier status read with a straight binary Good / Poor call
  // against each beach's own probability cutoff, and drop every percentage the
  // board would otherwise show (the gradient scale and its legend, the day-cell
  // labels, the map-pin numbers). For boards whose model publishes its own
  // Safe/Unsafe decision and whose cutoffs sit far below the shared 30/50/75
  // tiers, where those tiers would put a flagged beach in the "Normal" band.
  // Requires LocationConfig.statusFromThreshold so the two agree.
  binaryVerdict: boolean;
  // Show the generated plain-English summary of what the model is predicting
  // and why (see lib/summary.ts). Carries the probability as prose for boards
  // that hide the number itself.
  predictionSummary: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  currentConditionsLabel: false,
  neptuneIndex: false,
  hidePercentSign: false,
  hideExceedanceReadout: false,
  binaryVerdict: false,
  predictionSummary: false,
};

const FEATURES_BY_LOCATION: Record<string, Partial<FeatureFlags>> = {
  hermosa: {
    currentConditionsLabel: true,
    neptuneIndex: true,
    hidePercentSign: true,
    hideExceedanceReadout: true,
  },
  manhattan: {}, // stays exactly as today
  southbay: {}, // plain Manhattan-style — all flags default off
  cabrillo: {}, // plain Manhattan-style — all flags default off
  // Boston reads as a binary Good/Poor board: its model ships its own
  // Safe/Unsafe call against per-beach cutoffs of 10-25%, which the shared
  // 30/50/75 tiers would collapse into a single "Normal" band. The probability
  // still drives the page — it just speaks through the written summary.
  boston: {
    binaryVerdict: true,
    predictionSummary: true,
  },
};

// Resolve the flag set for a location slug. Unknown slugs fall through to the
// stable defaults (all off).
export function featuresFor(slug: string): FeatureFlags {
  return { ...DEFAULT_FLAGS, ...(FEATURES_BY_LOCATION[slug] ?? {}) };
}
