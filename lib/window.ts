import type { BeachData, ForecastDay, Verdict } from "./data";

// The day strip shared by the beach card and the list tab: which days a beach
// has, where "today" sits among them, and how a day is coloured.
//
// Extracted from BeachCard so the two views cannot drift. A list row showing a
// different set of days, or a different green, than the card it links to would
// be worse than having no list at all.

export type CellType = "past" | "today" | "forecast";

export interface WindowCell {
  day: ForecastDay;
  type: CellType;
}

/** How many days the strip shows at most, oldest first. */
export const WINDOW_DAYS = 7;

export const VERDICT_CELL_COLOR: Record<Verdict, string> = {
  Good: "#97C459",
  Poor: "#E24B4A",
};

// Text colour for the verdict written inside a day cell. Dark on the light
// green, white on the saturated red: each is the higher-contrast direction for
// its own background, so the label stays legible at small sizes without needing
// a different cell colour. Colour alone never carries the meaning here, the word
// is the read and the fill reinforces it.
export const VERDICT_CELL_TEXT: Record<Verdict, string> = {
  Good: "#1F3D07",
  Poor: "#FFFFFF",
};

export function weekdayShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });
}

/**
 * The days to show for one beach: past days, today, then the forecast.
 *
 * Today is rebuilt as a ForecastDay carrying the beach's full snapshot so it
 * behaves like the clickable past days rather than a special case.
 */
export function buildWindowCells(beach: BeachData): WindowCell[] {
  const todayCell: WindowCell = {
    day: {
      date: beach.predictionDate,
      probability: beach.probability,
      mpnLabel: beach.mpnLabel,
      status: beach.status,
      threshold: beach.threshold,
      verdict: beach.verdict,
      factors: beach.factors,
      drivers: beach.drivers,
      conditions: beach.conditions,
      insight: beach.insight,
      lastResult: beach.lastResult,
      daysSinceSample: beach.daysSinceSample,
    },
    type: "today",
  };
  const pastCells: WindowCell[] = beach.pastDays.map((d) => ({
    day: d,
    type: "past",
  }));
  const forecastCells: WindowCell[] = beach.forecast.map((d) => ({
    day: d,
    type: "forecast",
  }));
  return [...pastCells, todayCell, ...forecastCells].slice(0, WINDOW_DAYS);
}
