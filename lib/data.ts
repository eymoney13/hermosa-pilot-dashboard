export interface LocationConfig {
  slug: string;
  displayName: string; // e.g. "Hermosa Beach, CA" — used in BeachCard + header + metadata
  stations: string[]; // station codes for this location
  beachNames: Record<string, string>;
  mapFallbackCenter: [number, number]; // [lat, lng] used by MapView when no beaches loaded
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
  },
  // South Bay overview: one dashboard spanning Manhattan, Hermosa (two stations),
  // and Redondo. Tab order follows the coast north → south. Plain Manhattan-style
  // UI (no feature flags — see lib/features.ts).
  southbay: {
    slug: "southbay",
    displayName: "South Bay, CA",
    stations: ["DHS113", "DHS114", "DHS115", "DHS116"],
    beachNames: {
      DHS113: "Manhattan Beach",
      DHS114: "Hermosa Beach - 26th St",
      DHS115: "Hermosa Beach - TK",
      DHS116: "Redondo Beach",
    },
    mapFallbackCenter: [33.85, -118.4],
  },
};

// Helper: resolve a slug to a config, or undefined.
export function getLocation(slug: string): LocationConfig | undefined {
  return LOCATIONS[slug];
}

export type Status = "Normal" | "Slightly elevated" | "Not recommended";

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

export interface ForecastDay {
  date: string;
  probability: number;
  mpnLabel?: string;
  status: Status;
  // Per-day snapshot fields — populated for past days (from the history archive)
  // and for today (from the live nowcast); omitted for forecast/future days.
  factors?: string[];
  insight?: string;
  lastResult?: number | string | null;
  daysSinceSample?: number | null;
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
  status: Status;
  threshold: number;
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
  if (prob >= 0.5) return "Not recommended";
  if (prob >= 0.3) return "Slightly elevated";
  return "Normal";
}

// A raw (prediction, lab result) pair for one sampled day. `excProbability` is a
// fraction (0-1), matching nowcast_latest.csv's convention.
export interface RawAccuracySample {
  date: string;
  excProbability: number;
  labMpn: number;
}

// Score the model's classification against the lab for the most recent samples.
// A sample MATCHES when our predicted class equals the actual class:
//   predicted unsafe := excProbability >= threshold  (the same per-station 0.5
//                       boundary the dashboard uses for its risk language)
//   actually unsafe  := labMpn > EPA_MPN_THRESHOLD
// We compare classes, never the probability against the raw MPN directly.
export function computeAccuracy(
  rawSamples: RawAccuracySample[],
  threshold: number,
  windowN: number = ACCURACY_WINDOW
): Accuracy {
  // rawSamples arrive chronological (oldest → newest); score the last N.
  const recent = rawSamples.slice(-windowN);
  const samples: AccuracySample[] = recent.map((s) => {
    const predictedUnsafe = s.excProbability >= threshold;
    const actualUnsafe = s.labMpn > EPA_MPN_THRESHOLD;
    return {
      date: s.date,
      predictedExceedance: Math.round(s.excProbability * 100),
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
