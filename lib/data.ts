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
};

// Helper: resolve a slug to a config, or undefined.
export function getLocation(slug: string): LocationConfig | undefined {
  return LOCATIONS[slug];
}

export type Status = "Normal" | "Slightly elevated" | "Not recommended";

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
