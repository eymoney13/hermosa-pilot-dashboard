export interface LocationConfig {
  slug: string;
  displayName: string; // e.g. "Hermosa Beach, CA" — used in BeachCard + header + metadata
  stations: string[]; // station codes for this location
  beachNames: Record<string, string>;
  mapFallbackCenter: [number, number]; // [lat, lng] used by MapView when no beaches loaded
  // Optional per-location news filter (case-insensitive substring match against
  // an article's title/snippet/source/url). This is the in-code default; it can
  // be overridden at runtime by a NEWS_FILTER_TERMS_<SLUG> env var (e.g.
  // NEWS_FILTER_TERMS_MANHATTAN). Both override the global NEWS_FILTER_* config
  // for this location only; omit all three to use the global behavior.
  newsFilterTerms?: string[];
  // Optional: the beach roster (which stations to show, their display names and
  // coordinates) is published by the backend as a JSON file at
  // public/data/<slug>/<rosterFile>, rather than hand-listed in `stations` /
  // `beachNames` above. Locations that set this leave those two empty — the
  // roster is whatever the backend last published. See RosterFile in loadData.ts.
  rosterFile?: string;
  // Optional: classify status against this location's own per-station threshold
  // instead of the shared fixed tiers (see statusFromProb). Opt-in, because the
  // CA locations are calibrated to the fixed 30/50 cutoffs and must not move.
  statusFromThreshold?: boolean;
  // Official advisory authority linked in the page footer. Defaults to LA County
  // (the CA locations) when omitted.
  advisory?: { label: string; href: string };
}

export const LOCATIONS: Record<string, LocationConfig> = {
  hermosa: {
    slug: "hermosa",
    displayName: "Hermosa Beach, CA",
    stations: ["DHS114", "DHS115"],
    beachNames: {
      DHS114: "Hermosa Beach - 26th St",
      DHS115: "Hermosa Beach - TK",
    },
    mapFallbackCenter: [33.862, -118.403],
  },
  manhattan: {
    slug: "manhattan",
    displayName: "Manhattan Beach, CA",
    stations: ["DHS113"],
    beachNames: {
      DHS113: "Manhattan Beach - 26th St",
    },
    mapFallbackCenter: [33.8945, -118.418],
    // News tab shows only Manhattan Beach + LA-area coverage. Includes local
    // place names and LA news domains (matched against the article URL) to
    // catch stories that never spell out the city/state.
    newsFilterTerms: [
      "manhattan beach",
      "el porto",
      "el segundo",
      "south bay",
      "los angeles",
      "l.a.",
      "la county",
      "santa monica bay",
      "latimes.com",
      "ktla.com",
      "dailybreeze.com",
      "easyreadernews",
      "kfiam640",
      "lacounty.gov",
      "abc7.com",
    ],
  },
  // South Bay overview: one dashboard spanning Manhattan, Hermosa (two stations),
  // and Redondo. Tab order follows the coast north → south. Plain Manhattan-style
  // UI (no feature flags — see lib/features.ts).
  southbay: {
    slug: "southbay",
    displayName: "South Bay, CA",
    stations: ["DHS113", "DHS114", "DHS115", "DHS116"],
    beachNames: {
      DHS113: "Manhattan Beach - 26th st",
      DHS114: "Hermosa Beach - 26th St",
      DHS115: "Hermosa Beach - Herondo St",
      DHS116: "Redondo Beach - Topaz",
    },
    mapFallbackCenter: [33.85, -118.4],
  },
  // Cabrillo Beach (San Pedro) overview: three stations. Multi-beach, so the
  // dashboard opens to the all-locations Map tab (like South Bay). Station
  // coordinates come from the data files; the names below are placeholders —
  // confirm the real display names.
  cabrillo: {
    slug: "cabrillo",
    displayName: "Cabrillo Beach, CA",
    stations: ["CB-01", "CB-02", "SMB-7-9"],
    beachNames: {
      "CB-01": "Inner Cabrillo Beach (boatlaunch)",
      "CB-02": "Inner Cabrillo Beach (restrooms)",
      "SMB-7-9": "Outer Cabrillo Beach",
    },
    mapFallbackCenter: [33.707, -118.283],
  },
  // Boston-area beaches (Massachusetts). Unlike the CA locations, the roster is
  // owned by the backend and published as boston_display.json — so `stations`
  // and `beachNames` stay empty here and are resolved at load time. Boston's
  // model ships its own Safe/Unsafe call against a per-beach threshold
  // (DEFAULT 0.29), so it classifies on that threshold rather than the shared
  // fixed tiers, keeping the dashboard in agreement with the backend.
  boston: {
    slug: "boston",
    displayName: "Boston, MA",
    stations: [],
    beachNames: {},
    rosterFile: "boston_display.json",
    statusFromThreshold: true,
    mapFallbackCenter: [42.33, -71.02],
    advisory: {
      label: "Massachusetts Department of Public Health",
      href: "https://www.mass.gov/info-details/beach-water-quality",
    },
  },
};

// Helper: resolve a slug to a config, or undefined.
export function getLocation(slug: string): LocationConfig | undefined {
  return LOCATIONS[slug];
}

export type Status = "Normal" | "Slightly elevated" | "Not recommended";

// The binary read used by boards whose model publishes a straight Safe/Unsafe
// call against a per-beach probability cutoff (see verdictFor). Locations opt
// into showing it via the `binaryVerdict` feature flag; `Status` stays the
// internal 3-tier value every board computes, so nothing keyed to it changes.
export type Verdict = "Good" | "Poor";

// EPA single-sample safe-swimming standard for ocean water (MPN/100mL).
// A lab result above this is classified as an exceedance ("actually unsafe").
export const EPA_MPN_THRESHOLD = 104;

// Risk tiers keyed to exceedance percent — the single source of truth shared by
// the exceedance-scale legend (BeachCard) and the forecast-accuracy detail
// (ForecastAccuracy), so a sample's tier label always matches the legend.
export interface RiskTier {
  label: string; // legend / detail label, e.g. "Slightly elevated"
  range: string; // percent range for the legend, WITHOUT the % sign (e.g. "0–29")
  color: string; // swatch color, keyed to the gradient bar's discrete tiers
  textColor: string; // readable, saturated color for large tier-colored text
  maxExclusive: number; // upper bound (exclusive), in percent
}

export const RISK_TIERS: RiskTier[] = [
  { label: "Normal", range: "0–29", color: "#97C459", textColor: "#2D5A0B", maxExclusive: 30 },
  { label: "Slightly elevated", range: "30–49", color: "#D5C82E", textColor: "#6B5F0E", maxExclusive: 50 },
  { label: "Not recommended", range: "50–74", color: "#E24B4A", textColor: "#7A1F1F", maxExclusive: 75 },
  { label: "Strongly not recommended", range: "75–100", color: "#A32D2D", textColor: "#5A1414", maxExclusive: Infinity },
];

// The risk tier for an exceedance percentage (0–100).
export function riskTier(pct: number): RiskTier {
  return (
    RISK_TIERS.find((t) => pct < t.maxExclusive) ??
    RISK_TIERS[RISK_TIERS.length - 1]
  );
}

// The tier label for an exceedance percentage (0–100).
export function riskTierLabel(pct: number): string {
  return riskTier(pct).label;
}

// How many of the most recent lab samples the forecast-accuracy card scores and
// shows as dots — the last 7. Single source of truth so the score and the dot
// strip (and its screen-reader summary) always describe the same set of samples.
export const ACCURACY_WINDOW = 7;

// Below this many samples we show "not enough data yet" instead of a score that
// would be too small to be meaningful.
export const ACCURACY_MIN_SAMPLES = 5;

// One scored lab sample: the model's call vs. what the lab actually measured.
export interface AccuracySample {
  date: string; // ISO date the lab sample was taken
  predictedExceedance: number; // our exceedance probability that day, as a percent (0-100)
  predictedUnsafe: boolean; // our call: prob >= threshold (stored, not re-derived from the rounded percent)
  labMpn: number; // the lab result, MPN/100mL
  match: boolean; // predicted class === actual class (both safe or both unsafe)
}

export interface Accuracy {
  windowSize: number; // number of samples scored (= samples.length)
  matches: number; // how many of them matched
  samples: AccuracySample[]; // chronological, oldest → newest
}

// Which way a contributing factor pushed the model's risk estimate. Published
// by backends that ship SHAP directions alongside their top factors.
export type FactorDirection = "increasing risk" | "decreasing risk";

// A ranked driver of one day's prediction: what the model keyed on, and whether
// it pushed risk up or down.
export interface Driver {
  factor: string; // canonical display label (see lib/factors.ts)
  direction: FactorDirection;
}

// The measured environmental conditions behind one day's prediction, in human
// units. Every field is optional: the backend blanks any value whose source
// feed is too stale to describe that day (an NDBC buoy that stopped reporting,
// say), and the dashboard must then say nothing rather than guess. See
// scripts/env_conditions_region.py in project-neptune.
export interface Conditions {
  rainTodayMm?: number; // rain on the day itself
  rainPrior3dMm?: number; // rain over the three days before it
  windKph?: number;
  airTempC?: number;
  solarMj?: number; // shortwave radiation — sunlight, which inactivates bacteria
  waterTempC?: number;
  waveHeightM?: number;
  tideRangeM?: number; // the day's tidal range; bigger range flushes harder
  springTide?: boolean;
  riverFlow?: "low" | "moderate" | "high" | "very high";
  // Distance to the nearest combined sewer overflow outfall. Geometry, not an
  // observation, so it never goes stale — a standing property of the beach.
  csoDistKm?: number;
}

export interface ForecastDay {
  date: string;
  probability: number;
  mpnLabel?: string;
  status: Status;
  // The cutoff this day was classified against. Boston's model re-tunes its
  // threshold per forecast horizon (day 1 and day 3 can differ by 8 points), so
  // a day must be scored against its own value, not the nowcast's. Backends
  // that publish one fixed cutoff leave this equal to BeachData.threshold.
  threshold?: number;
  // The binary Good/Poor call for this day, resolved at load time — the
  // backend's published decision where it ships one, otherwise derived. Only
  // meaningful on boards that render it (see the `binaryVerdict` flag).
  verdict?: Verdict | null;
  // Per-day snapshot fields — populated for past days (from the history archive)
  // and for today (from the live nowcast); omitted for forecast/future days.
  factors?: string[];
  insight?: string;
  lastResult?: number | string | null;
  daysSinceSample?: number | null;
  // Ranked drivers with the direction each pushed risk, and the conditions
  // themselves. Unlike `factors` these are populated for FUTURE days too — a
  // forecast has no lab sample but it does have forecast weather, and that is
  // exactly what the written summary explains the day in terms of.
  drivers?: Driver[];
  conditions?: Conditions;
}

export interface BeachData {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  predictionDate: string;
  probability: number;
  mpnLabel?: string;
  lastResult: number | string | null;
  daysSinceSample: number | null;
  factors: string[];
  insight: string;
  // Today's ranked drivers and measured conditions — see ForecastDay.
  drivers: Driver[];
  conditions: Conditions;
  status: Status;
  threshold: number;
  // Today's binary Good/Poor call — see ForecastDay.verdict.
  verdict: Verdict | null;
  // The model had no recent lab sample to anchor this beach's prediction, so it
  // leans entirely on environmental signal. Surfaced as a caveat in the summary.
  noRecentSample: boolean;
  // Long-run descriptive stats from the backend's roster file: what share of
  // every lab sample ever taken here exceeded the EPA limit, and how many
  // samples that is. null for locations without a roster file.
  excRatePct: number | null;
  nSamples: number | null;
  pastDays: ForecastDay[];
  forecast: ForecastDay[];
  accuracy: Accuracy;
}

export interface DashboardData {
  beaches: BeachData[];
  predictionDate: string;
}

export function thresholdFor(
  code: string,
  thresholdMap: Record<string, number>
): number {
  if (thresholdMap[code] != null) return thresholdMap[code];
  if (thresholdMap["DEFAULT"] != null) return thresholdMap["DEFAULT"];
  return 0.5;
}

export function statusFromProb(
  prob: number | null | undefined,
  code: string,
  thresholdMap: Record<string, number>
): Status | null {
  if (prob == null || Number.isNaN(prob)) return null;
  // Classify on the same rounded percent the dashboard displays, so the banner
  // can never disagree with the number shown. Comparing the raw fraction here
  // let a value like 0.497 round up to "50" on screen while still falling under
  // the 0.5 cutoff and reading "Slightly elevated".
  const pct = Math.round(prob * 100);
  if (pct >= 50) return "Not recommended";
  if (pct >= 30) return "Slightly elevated";
  return "Normal";
}

// The fixed tiers above place "Slightly elevated" at 30 and "Not recommended"
// at 50 — the elevated band opens at 60% of the unsafe cutoff. We keep that
// same shape when classifying against a location's own threshold, so a board
// calibrated to a different cutoff still reads with familiar proportions.
const ELEVATED_BAND_RATIO = 30 / 50;

// Status for locations whose backend publishes its own Safe/Unsafe call against
// a per-station threshold (LocationConfig.statusFromThreshold). "Not
// recommended" starts exactly at that threshold, so the banner can never
// disagree with the backend's own verdict for the same beach.
//
// Comparison happens on the rounded percent both sides display, matching
// statusFromProb — see the note there on why the raw fraction is the wrong
// thing to compare.
export function statusFromThreshold(
  prob: number | null | undefined,
  threshold: number
): Status | null {
  if (prob == null || Number.isNaN(prob)) return null;
  const pct = Math.round(prob * 100);
  const unsafePct = Math.round(threshold * 100);
  if (pct >= unsafePct) return "Not recommended";
  if (pct >= Math.round(unsafePct * ELEVATED_BAND_RATIO)) {
    return "Slightly elevated";
  }
  return "Normal";
}

// Fallback binary call, derived from a probability and its cutoff. Only used
// when the backend does not publish its own decision for the row — prefer
// verdictFromPrediction, which cannot drift from the model.
//
// Comparison is on the rounded percent, matching statusFromProb /
// statusFromThreshold, so the call agrees with any number shown alongside it.
export function verdictFor(
  prob: number | null | undefined,
  threshold: number
): Verdict | null {
  if (prob == null || Number.isNaN(prob)) return null;
  return Math.round(prob * 100) >= Math.round(threshold * 100) ? "Poor" : "Good";
}

// The model's own Safe/Unsafe decision for a row, as published in the
// `prediction` / `day{i}_prediction` columns.
//
// This is authoritative and beats recomputing from the probability. The two can
// legitimately differ: the model compares raw fractions, while everything the
// dashboard displays is rounded to whole percent, so a 13.8% probability
// against a 14% cutoff is Safe to the model but rounds to "14 >= 14" here.
// Inside that half-point band the model's call wins.
export function verdictFromPrediction(raw: unknown): Verdict | null {
  const text = String(raw ?? "").trim().toLowerCase();
  if (text === "unsafe") return "Poor";
  if (text === "safe") return "Good";
  return null;
}

// Good/Poor reuses the Normal / Not-recommended palette rather than
// introducing a second green and a second red. Callers style a verdict by
// mapping it through this.
export const VERDICT_AS_STATUS: Record<Verdict, Status> = {
  Good: "Normal",
  Poor: "Not recommended",
};

// A raw (prediction, lab result) pair for one sampled day. `excProbability` is a
// fraction (0-1), matching nowcast_latest.csv's convention.
export interface RawAccuracySample {
  date: string;
  excProbability: number;
  labMpn: number;
}

// Score the model's classification against the lab for the most recent samples.
// A sample MATCHES when our predicted class equals the actual class:
//   predicted unsafe := round(excProbability*100) >= round(threshold*100)  (the
//                       same rounded-percent boundary statusFromProb uses, so
//                       the score never disagrees with the number on screen)
//   actually unsafe  := labMpn > EPA_MPN_THRESHOLD
// We compare classes, never the probability against the raw MPN directly.
export function computeAccuracy(
  rawSamples: RawAccuracySample[],
  threshold: number,
  windowN: number = ACCURACY_WINDOW
): Accuracy {
  // rawSamples arrive chronological (oldest → newest); score the last N.
  const recent = rawSamples.slice(-windowN);
  // Classify on the same rounded percent the dashboard displays (see
  // statusFromProb), never the raw fraction. Otherwise a probability like 0.497
  // shows on screen as "50% — Not recommended" but scores as "predicted safe",
  // so a genuine miss reads as "Matched".
  const thresholdPct = Math.round(threshold * 100);
  const samples: AccuracySample[] = recent.map((s) => {
    const predictedExceedance = Math.round(s.excProbability * 100);
    const predictedUnsafe = predictedExceedance >= thresholdPct;
    const actualUnsafe = s.labMpn > EPA_MPN_THRESHOLD;
    return {
      date: s.date,
      predictedExceedance,
      predictedUnsafe,
      labMpn: s.labMpn,
      match: predictedUnsafe === actualUnsafe,
    };
  });
  const matches = samples.filter((s) => s.match).length;
  return { windowSize: samples.length, matches, samples };
}

export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatMonthDayYear(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatWeekdayShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date
    .toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" })
    .toUpperCase();
}

export function formatMonthDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

export function subtractDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
