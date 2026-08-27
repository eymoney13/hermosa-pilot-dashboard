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
  // Replace the 3-tier status read with a Good / Moderate / Poor call against
  // each beach's own probability cutoff, and drop every percentage the board
  // would otherwise show (the gradient scale and its legend, the day-cell
  // labels, the map-pin numbers). For boards whose model publishes its own
  // Safe/Unsafe decision and whose cutoffs sit far below the shared 30/50/75
  // tiers, where those tiers would put a flagged beach in the "Normal" band.
  // Requires LocationConfig.statusFromThreshold so the two agree.
  //
  // Named for the two-state call it started as. The flag still selects the
  // model's own verdict over the shared tiers, which is what it has always
  // meant; Moderate subdivides the Safe side of that same call.
  binaryVerdict: boolean;
  // Show the generated plain-English summary of what the model is predicting
  // and why (see lib/summary.ts). Carries the probability as prose for boards
  // that hide the number itself.
  predictionSummary: boolean;
  // Add a List tab, left of Map: every beach as a row, name on the left and its
  // day strip on the right. Earns its place on a board with enough beaches that
  // reading the week off the map would mean hovering each pin in turn.
  listTab: boolean;
  // Drop the per-beach tabs from the tab bar, leaving only List / Map / News.
  // For boards with enough beaches that the tabs overflow into a scroller,
  // where they are a worse way to reach a beach than the List or the Map. The
  // cards stay reachable from both; only the tabs go.
  hideBeachTabs: boolean;
  // Move the day window above the status read instead of below the summary, so
  // the week is the first thing on a beach's card rather than the last thing
  // before the fold.
  forecastWindowFirst: boolean;
  // Drop the numbered "Top contributing factors" list. With it gone there is no
  // detail left to hide, so the forecast-accuracy panel stands on its own
  // instead of behind the "Behind the Prediction" disclosure.
  hideContributingFactors: boolean;
  // Open the board on the Map even when the List tab is showing. Without this,
  // the List is the landing tab wherever it appears. For boards that want the
  // List available as a way to read the whole coast at once, but whose readers
  // arrive asking "which of these is near me" first.
  openOnMap: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  currentConditionsLabel: false,
  neptuneIndex: false,
  hidePercentSign: false,
  hideExceedanceReadout: false,
  binaryVerdict: false,
  predictionSummary: false,
  listTab: false,
  hideBeachTabs: false,
  forecastWindowFirst: false,
  hideContributingFactors: false,
  openOnMap: false,
};

const FEATURES_BY_LOCATION: Record<string, Partial<FeatureFlags>> = {
  hermosa: {
    currentConditionsLabel: true,
    neptuneIndex: true,
    hidePercentSign: true,
    hideExceedanceReadout: true,
  },
  manhattan: {}, // stays exactly as today
  // Nine beaches is past the point where the map alone answers "how does the
  // whole coast look today" — five of them are Dockweiler pins within 2 km of
  // each other, so telling them apart on the map means hovering each in turn.
  // Everything else stays Manhattan-style: BeachList falls back to the shared
  // 30/50/75 tiers and shows the percentage when binaryVerdict is off, so the
  // rows read exactly like the cards and the map already do.
  //
  // The Map stays the landing tab. The List is a second way in, not a
  // replacement for the view the board has always opened on.
  southbay: {
    listTab: true,
    openOnMap: true,
  },
  cabrillo: {}, // plain Manhattan-style — all flags default off
  // Boston reads as a Good/Moderate/Poor board: its model ships its own
  // Safe/Unsafe call against per-beach cutoffs of 10-25%, which the shared
  // 30/50/75 tiers would collapse into a single "Normal" band. Moderate splits
  // the Safe side at 75% of each beach's own cutoff (see MODERATE_BAND_RATIO),
  // so it never contradicts that call. The probability still drives the page -
  // it just speaks through the written summary.
  boston: {
    binaryVerdict: true,
    predictionSummary: true,
    // 13 beaches is past the point where the map alone answers "how does the
    // whole coast look this week".
    listTab: true,
    // ...and past the point where 13 tabs are a usable way to pick one. They
    // overflow into a horizontal scroller, so most are off-screen anyway.
    hideBeachTabs: true,
    // The week is what a reader came for; today's call is one cell of it.
    forecastWindowFirst: true,
    // The written summary already explains the drivers in prose. A ranked list
    // of the same feature names underneath is the model talking about itself.
    hideContributingFactors: true,
  },
};

// Resolve the flag set for a location slug. Unknown slugs fall through to the
// stable defaults (all off).
export function featuresFor(slug: string): FeatureFlags {
  return { ...DEFAULT_FLAGS, ...(FEATURES_BY_LOCATION[slug] ?? {}) };
}
