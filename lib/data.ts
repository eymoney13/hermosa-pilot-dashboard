export const HERMOSA_STATIONS = ["DHS114", "DHS115"] as const;

export const BEACH_NAMES: Record<string, string> = {
  DHS114: "Hermosa Beach - 26th St",
  DHS115: "Hermosa Beach - TK",
};

export type Status = "Normal" | "Not recommended";

export interface ForecastDay {
  date: string;
  probability: number;
  mpnLabel?: string;
  status: Status;
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
  return prob >= thresholdFor(code, thresholdMap)
    ? "Not recommended"
    : "Normal";
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
