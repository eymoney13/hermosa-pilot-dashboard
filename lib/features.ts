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
}

const DEFAULT_FLAGS: FeatureFlags = {
  currentConditionsLabel: false,
  neptuneIndex: false,
  hidePercentSign: false,
  hideExceedanceReadout: false,
};

const FEATURES_BY_LOCATION: Record<string, Partial<FeatureFlags>> = {
  hermosa: {
    currentConditionsLabel: true,
    neptuneIndex: true,
    hidePercentSign: true,
    hideExceedanceReadout: true,
  },
  manhattan: {}, // stays exactly as today
};

// Resolve the flag set for a location slug. Unknown slugs fall through to the
// stable defaults (all off).
export function featuresFor(slug: string): FeatureFlags {
  return { ...DEFAULT_FLAGS, ...(FEATURES_BY_LOCATION[slug] ?? {}) };
}
