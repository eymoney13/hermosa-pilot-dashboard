import { EPA_MPN_THRESHOLD, formatMonthDayYear, type Status } from "./data";

/**
 * Words a reader sees for a beach's bacteria status, and for the probability
 * next to it. The cutoffs those words describe live in `RISK_TIERS` (and
 * `statusFromProb` reads that same table). Change the scale there; change
 * the sentences here. Neither file invents a second set of numbers.
 *
 * The phrases describe an estimate against the beach standard. They do not
 * say the water is safe to swim, and they do not claim a confidence score.
 */
export const STATUS_READING: Record<
  Status,
  { pill: string; title: string; detail: string }
> = {
  Normal: {
    pill: "Under limit",
    title: "Under the limit",
    detail: `The model estimates enterococcus is under the ${EPA_MPN_THRESHOLD} MPN/100 mL beach standard.`,
  },
  "Slightly elevated": {
    pill: "Near limit",
    title: "Near the limit",
    detail: `The model estimates enterococcus is higher, and still under the ${EPA_MPN_THRESHOLD} MPN/100 mL beach standard.`,
  },
  "Not recommended": {
    pill: "Over limit",
    title: "Over the limit",
    detail: `The model estimates enterococcus may be over the ${EPA_MPN_THRESHOLD} MPN/100 mL beach standard.`,
  },
};

export function statusReading(status: Status) {
  return STATUS_READING[status];
}

/** Plain gloss for each `RISK_TIERS` row, in the same order. */
const TIER_READINGS = [
  "Under the limit",
  "Near the limit",
  "Over the limit",
  "Well over the limit",
] as const;

export function tierReading(index: number, fallback: string): string {
  return TIER_READINGS[index] ?? fallback;
}

export const PROBABILITY_CAPTION = `Estimated chance a lab test would exceed ${EPA_MPN_THRESHOLD} MPN/100 mL. A model estimate, not a water sample.`;

/**
 * A sample older than a week is "limited lab data". Weekly is the pace the
 * monitoring programs aim for; most California beaches are tested far less
 * often, so this line is an ordinary fact about the beach, not an alarm.
 * There is no separate confidence field. Do not invent one.
 */
export const LIMITED_DATA_AFTER_DAYS = 7;

export const LIMITED_LAB_NOTE =
  "Limited lab data. Many beaches are tested only occasionally, so this estimate leans on weather and tides until the next water test.";

export function lastTestedLabel(days: number | null): string | null {
  if (days == null || !Number.isFinite(days)) return null;
  const n = Math.max(0, Math.round(days));
  if (n === 0) return "Last tested today";
  if (n === 1) return "Last tested 1 day ago";
  return `Last tested ${n} days ago`;
}

export function hasLimitedLabData(
  days: number | null,
  noRecentSample: boolean
): boolean {
  if (noRecentSample) return true;
  if (days == null || !Number.isFinite(days)) return false;
  return days > LIMITED_DATA_AFTER_DAYS;
}

/** Compact list-row line. Null when the pipeline did not publish an age. */
export function labFreshnessLine(
  days: number | null,
  noRecentSample: boolean
): string | null {
  const tested = lastTestedLabel(days);
  const limited = hasLimitedLabData(days, noRecentSample);
  if (limited) {
    return tested ? `${tested} · Limited lab data` : "Limited lab data";
  }
  return tested;
}

export interface LastUpdatedDisplay {
  text: string;
  short: string;
  dateTime?: string;
}

/**
 * Freshness line for the header.
 *
 * Prefer the pipeline's `generated_at` when a board publishes one. The
 * California nowcast does not, today: the forecast date is the freshness
 * fact the files actually contain, so that date is what we show. A clock
 * time appears on its own once `generated_at` is present. Nothing here is
 * guessed from the server clock or from the marketing `today.json` stamp.
 */
export function lastUpdatedDisplay(
  generatedAt: string | null | undefined,
  predictionDate: string | null | undefined,
  timeZone: string
): LastUpdatedDisplay {
  if (generatedAt) {
    const t = new Date(generatedAt);
    if (!Number.isNaN(t.getTime())) {
      return {
        text: t.toLocaleString("en-US", {
          timeZone,
          month: "long",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        }),
        short: t.toLocaleString("en-US", {
          timeZone,
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        dateTime: t.toISOString(),
      };
    }
  }
  if (predictionDate) {
    const [y, m, d] = predictionDate.split("-").map(Number);
    const short =
      y && m && d
        ? new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
            timeZone: "UTC",
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : predictionDate;
    return {
      text: formatMonthDayYear(predictionDate),
      short,
      dateTime: predictionDate,
    };
  }
  return { text: "Awaiting readings", short: "Awaiting readings" };
}

/** Today's calendar day in a board's timezone, as YYYY-MM-DD. */
export function calendarDay(timeZone: string, now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone });
}
